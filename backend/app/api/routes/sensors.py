from decimal import Decimal
from typing import Literal, cast

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.api.dependencies import require_test_admin
from app.db.session import get_db_session
from app.models.audit_log import AuditLog
from app.models.sensor import Sensor, SensorEvaluationState
from app.schemas.common import ErrorResponse
from app.schemas.sensors import SensorCreate, SensorListResponse, SensorResponse, SensorUpdate

router = APIRouter(
    prefix="/sensors",
    tags=["sensors"],
    dependencies=[Depends(require_test_admin)],
)


def _snapshot(sensor: Sensor) -> dict[str, str | float | None]:
    """監査ログに秘密情報を含めず、変更対象だけを保存する。"""

    return {
        "sensor_code": sensor.sensor_code,
        "name": sensor.name,
        "latitude": float(sensor.latitude),
        "longitude": float(sensor.longitude),
        "device_external_id": sensor.device_external_id,
        "installed_at": sensor.installed_at.isoformat() if sensor.installed_at else None,
        "position_accuracy_m": (
            float(sensor.position_accuracy_m) if sensor.position_accuracy_m is not None else None
        ),
        "identity_method": sensor.identity_method,
        "position_method": sensor.position_method,
    }


def _response(sensor: Sensor) -> SensorResponse:
    evaluation: SensorEvaluationState | None = sensor.evaluation_state
    return SensorResponse(
        id=sensor.id,
        sensor_code=sensor.sensor_code,
        name=sensor.name,
        latitude=float(sensor.latitude),
        longitude=float(sensor.longitude),
        observation_severity=cast(
            Literal["normal", "caution", "danger", "unknown"],
            evaluation.observation_severity if evaluation is not None else "unknown",
        ),
        communication_status=cast(
            Literal["online", "offline", "unknown"],
            evaluation.communication_status if evaluation is not None else "unknown",
        ),
        device_fault_status=cast(
            Literal["ok", "fault", "unknown"],
            evaluation.device_fault_status if evaluation is not None else "unknown",
        ),
        low_battery=evaluation.low_battery if evaluation is not None else None,
        last_received_at=sensor.last_received_at,
        installed_at=sensor.installed_at,
        position_accuracy_m=(
            float(sensor.position_accuracy_m) if sensor.position_accuracy_m is not None else None
        ),
        identity_method=sensor.identity_method,
        position_method=sensor.position_method,
    )


def _active_sensor_or_404(session: Session, sensor_id: str) -> Sensor:
    sensor = session.scalar(
        select(Sensor)
        .options(joinedload(Sensor.evaluation_state))
        .where(Sensor.id == sensor_id, Sensor.is_deleted.is_(False))
    )
    if sensor is None:
        raise HTTPException(status_code=404, detail="sensor not found")
    return sensor


@router.get(
    "",
    response_model=SensorListResponse,
    responses={
        400: {"model": ErrorResponse},
        401: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
    },
)
def list_sensors(
    q: str | None = Query(default=None, max_length=120),
    limit: int = Query(default=100, ge=1, le=200),
    cursor: str | None = Query(default=None, max_length=36),
    session: Session = Depends(get_db_session),  # noqa: B008
) -> SensorListResponse:
    """test環境の登録済みセンサーをカーソル付きで取得する。"""

    statement = (
        select(Sensor)
        .options(joinedload(Sensor.evaluation_state))
        .where(Sensor.is_deleted.is_(False))
    )
    if q and q.strip():
        escaped_q = q.strip().lower().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped_q}%"
        statement = statement.where(
            or_(
                func.lower(Sensor.sensor_code).like(pattern, escape="\\"),
                func.lower(Sensor.name).like(pattern, escape="\\"),
            )
        )
    if cursor:
        cursor_sensor = session.get(Sensor, cursor)
        if cursor_sensor is None or cursor_sensor.is_deleted:
            raise HTTPException(status_code=400, detail="invalid cursor")
        statement = statement.where(
            or_(
                Sensor.created_at > cursor_sensor.created_at,
                and_(Sensor.created_at == cursor_sensor.created_at, Sensor.id > cursor_sensor.id),
            )
        )

    sensors = list(
        session.scalars(statement.order_by(Sensor.created_at, Sensor.id).limit(limit + 1)).all()
    )
    next_cursor = sensors[limit - 1].id if len(sensors) > limit else None
    return SensorListResponse(
        items=[_response(sensor) for sensor in sensors[:limit]],
        next_cursor=next_cursor,
    )


@router.get(
    "/{sensor_id}",
    response_model=SensorResponse,
    responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def get_sensor(
    sensor_id: str,
    session: Session = Depends(get_db_session),  # noqa: B008
) -> SensorResponse:
    return _response(_active_sensor_or_404(session, sensor_id))


@router.post(
    "",
    response_model=SensorResponse,
    status_code=status.HTTP_201_CREATED,
    responses={401: {"model": ErrorResponse}, 409: {"model": ErrorResponse}},
)
def create_sensor(
    payload: SensorCreate,
    session: Session = Depends(get_db_session),  # noqa: B008
) -> SensorResponse:
    """未観測状態のセンサーと登録監査ログを同一トランザクションで作成する。"""

    sensor = Sensor(
        sensor_code=payload.sensor_code,
        name=payload.name,
        latitude=Decimal(str(payload.latitude)),
        longitude=Decimal(str(payload.longitude)),
        installed_at=payload.installed_at,
        position_accuracy_m=(
            Decimal(str(payload.position_accuracy_m))
            if payload.position_accuracy_m is not None
            else None
        ),
        identity_method=payload.identity_method,
        position_method=payload.position_method,
    )
    sensor.evaluation_state = SensorEvaluationState()
    try:
        session.add(sensor)
        session.flush()
        session.add(
            AuditLog(
                action="sensor.created",
                target_type="sensor",
                target_id=sensor.id,
                after_json=_snapshot(sensor),
            )
        )
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(status_code=409, detail="sensor code already exists") from exc
    session.refresh(sensor)
    return _response(sensor)


@router.patch(
    "/{sensor_id}",
    response_model=SensorResponse,
    responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def update_sensor(
    sensor_id: str,
    payload: SensorUpdate,
    session: Session = Depends(get_db_session),  # noqa: B008
) -> SensorResponse:
    """名称と設置座標を更新し、変更前後を監査ログへ残す。"""

    sensor = _active_sensor_or_404(session, sensor_id)
    before = _snapshot(sensor)
    if payload.name is not None:
        sensor.name = payload.name
    sensor.latitude = Decimal(str(payload.latitude))
    sensor.longitude = Decimal(str(payload.longitude))
    if payload.installed_at is not None:
        sensor.installed_at = payload.installed_at
    if payload.position_accuracy_m is not None:
        sensor.position_accuracy_m = Decimal(str(payload.position_accuracy_m))
    if payload.identity_method is not None:
        sensor.identity_method = payload.identity_method
    if payload.position_method is not None:
        sensor.position_method = payload.position_method
    session.add(
        AuditLog(
            action="sensor.updated",
            target_type="sensor",
            target_id=sensor.id,
            before_json=before,
            after_json=_snapshot(sensor),
        )
    )
    session.commit()
    session.refresh(sensor)
    return _response(sensor)


@router.delete(
    "/{sensor_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def delete_sensor(
    sensor_id: str,
    session: Session = Depends(get_db_session),  # noqa: B008
) -> None:
    """センサーを削除し、同じIDでの再登録を可能にする。"""

    sensor = _active_sensor_or_404(session, sensor_id)
    before = _snapshot(sensor)
    session.add(
        AuditLog(
            action="sensor.deleted",
            target_type="sensor",
            target_id=sensor.id,
            before_json=before,
            after_json=None,
        )
    )
    session.delete(sensor)
    session.commit()
