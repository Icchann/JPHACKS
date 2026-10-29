"""姿勢変化警報の取得・確認・消音・手動解除APIルートの実装。

設計意図 (Issue #61, DEC-23):
1. PC常駐判定エンジンが検知した機体別の警報ラッチ状態をブラウザ画面へ公開する。
2. 警告の「確認 (Acknowledge)」「解除 (Clear)」を明示的な操作とし、
   通常の警報解除によって基準姿勢（Capture）を勝手に上書き・リセットしない。
"""

from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import require_test_admin
from app.db.session import get_db_session
from app.models.installation import AlertEvent

router = APIRouter(
    prefix="/api/v1/alerts",
    tags=["alerts"],
    dependencies=[Depends(require_test_admin)],
)


class AlertItemResponse(BaseModel):
    id: str
    node_id: str
    installation_id: str | None
    capture_id: str | None
    tilt_degrees: float
    severity: Literal["caution", "danger", "cleared"]
    status: Literal["active", "acknowledged", "cleared"]
    reason: str
    triggered_at: datetime
    resolved_at: datetime | None


class AlertActionResponse(BaseModel):
    node_id: str
    action: Literal["acknowledged", "cleared"]
    message: str


@router.get(
    "/active",
    response_model=list[AlertItemResponse],
    summary="現在発火中の機体別警報一覧",
)
def list_active_alerts(
    db: Annotated[Session, Depends(get_db_session)],
) -> list[AlertItemResponse]:
    alerts = db.scalars(
        select(AlertEvent)
        .where(AlertEvent.status.in_(("active", "acknowledged")))
        .order_by(AlertEvent.triggered_at.desc())
    ).all()

    return [
        AlertItemResponse(
            id=a.id,
            node_id=a.node_id,
            installation_id=a.installation_id,
            capture_id=a.capture_id,
            tilt_degrees=float(a.tilt_degrees),
            severity=a.severity,  # type: ignore[arg-type]
            status=a.status,  # type: ignore[arg-type]
            reason=a.reason,
            triggered_at=a.triggered_at,
            resolved_at=a.resolved_at,
        )
        for a in alerts
    ]


@router.post(
    "/{node_id}/acknowledge",
    response_model=AlertActionResponse,
    summary="対象機体の警報確認・消音",
)
def acknowledge_alert(
    node_id: str,
    db: Annotated[Session, Depends(get_db_session)],
) -> AlertActionResponse:
    alert = db.scalar(
        select(AlertEvent)
        .where(AlertEvent.node_id == node_id, AlertEvent.status == "active")
        .order_by(AlertEvent.triggered_at.desc())
    )
    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"機体 {node_id} のアクティブな未確認警報は存在しません",
        )

    alert.status = "acknowledged"
    db.commit()

    return AlertActionResponse(
        node_id=node_id,
        action="acknowledged",
        message=f"機体 {node_id} の警報を確認・消音しました（基準姿勢は維持されます）",
    )


@router.post(
    "/{node_id}/clear",
    response_model=AlertActionResponse,
    summary="対象機体の警報手動解除",
)
def clear_alert(
    node_id: str,
    db: Annotated[Session, Depends(get_db_session)],
) -> AlertActionResponse:
    alerts = db.scalars(
        select(AlertEvent).where(
            AlertEvent.node_id == node_id, AlertEvent.status.in_(("active", "acknowledged"))
        )
    ).all()
    if not alerts:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"機体 {node_id} のアクティブな警報は存在しません",
        )

    now_utc = datetime.now(UTC)
    for a in alerts:
        a.status = "cleared"
        a.resolved_at = now_utc
    db.commit()

    return AlertActionResponse(
        node_id=node_id,
        action="cleared",
        message=f"機体 {node_id} の警報を手動解除しました（基準姿勢は維持されます）",
    )
