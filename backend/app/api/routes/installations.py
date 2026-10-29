"""現場設置およびBLE基準取得結果を一括確定する冪等APIルートの実装。

設計意図 (Issue #59, DEC-23):
1. 現場スマホから持ち帰った位置座標・精度・設置日時と機体静止基準（Capture）を、
   DBトランザクションで不可分に確定し、位置だけ登録・基準未登録の中途半端な状態を排除する。
2. request_idによる冪等性管理を行い、二重送信には同一レスポンスを返却、
   同一IDでの異ペイロード送信は 409 Conflict として拒否する。
3. 再設置時は既存のactive設置をsupersededとし、古い設置履歴を保持したまま新世代へ切り替える。
"""

import hashlib
import json
from datetime import UTC, datetime
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import require_test_admin
from app.db.session import get_db_session
from app.models.installation import Capture, Installation, SyncRequestLog
from app.models.sensor import Sensor
from app.schemas.installation import (
    InstallationConfirmRequest,
    InstallationConfirmResponse,
    InstallationStatusResponse,
)

router = APIRouter(
    prefix="/api/v1/installations",
    tags=["installations"],
    dependencies=[Depends(require_test_admin)],
)


def _calc_payload_hash(payload: InstallationConfirmRequest) -> str:
    """要求内容のSHA-256ハッシュを計算し、二重送信の同一性を判定する。"""
    serialized = payload.model_dump_json(exclude={"request_id"})
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


@router.post(
    "/confirm",
    response_model=InstallationConfirmResponse,
    status_code=status.HTTP_200_OK,
    summary="設置および基準取得結果の一括確定（冪等）",
)
def confirm_installation(
    req: InstallationConfirmRequest,
    db: Annotated[Session, Depends(get_db_session)],
) -> InstallationConfirmResponse:
    # 1. 基準姿勢の異常値検査（全軸ゼロまたは極端な異常値）
    cap = req.capture
    if cap.baseline_ax_mg == 0 and cap.baseline_ay_mg == 0 and cap.baseline_az_mg == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="全軸ゼロの基準加速度は無効です",
        )
    if cap.quality == "rejected":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="品質がrejectedの基準姿勢は登録できません",
        )

    payload_hash = _calc_payload_hash(req)

    # 2. 既存の冪等ログを検索
    existing_log = db.scalar(
        select(SyncRequestLog).where(SyncRequestLog.request_id == req.request_id)
    )
    if existing_log:
        if existing_log.payload_hash != payload_hash:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="同一request_idで異なる内容がすでに確定されています",
            )
        # 同一要求の再送: 保存済みレスポンスを復元して返却
        saved_dict = json.loads(existing_log.response_body)
        return InstallationConfirmResponse(
            status="already_confirmed",
            request_id=saved_dict["request_id"],
            node_id=saved_dict["node_id"],
            installation_id=saved_dict["installation_id"],
            capture_id=saved_dict["capture_id"],
            confirmed_at=datetime.fromisoformat(saved_dict["confirmed_at"]),
            message="この設置要求はすでに確定されています（冪等返却）",
        )

    # 3. 既存のactive設置を取得し、世代番号を管理
    active_installations = db.scalars(
        select(Installation)
        .where(Installation.node_id == req.node_id, Installation.status == "active")
        .order_by(Installation.version.desc())
    ).all()

    next_version = 1
    if active_installations:
        latest = active_installations[0]
        # 期待バージョン検証
        if req.expected_version < latest.version:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"既存の設置世代 ({latest.version}) より古い期待世代 "
                    f"({req.expected_version}) のため競合しました"
                ),
            )
        next_version = latest.version + 1
        # 旧設置をsupersededへ遷移させて履歴を保護
        for inst in active_installations:
            inst.status = "superseded"

    # 4. 新規 Installation レコードの作成
    new_inst = Installation(
        installation_id=req.installation_id,
        node_id=req.node_id,
        request_id=req.request_id,
        installed_at=req.installed_at,
        latitude=Decimal(str(req.latitude)),
        longitude=Decimal(str(req.longitude)),
        position_accuracy_m=(
            Decimal(str(req.position_accuracy_m)) if req.position_accuracy_m is not None else None
        ),
        identity_method=req.identity_method,
        position_method=req.position_method,
        status="active",
        version=next_version,
    )
    db.add(new_inst)

    # 5. 不変 Capture レコードの作成
    new_cap = Capture(
        capture_id=cap.capture_id,
        installation_id=req.installation_id,
        node_id=req.node_id,
        baseline_ax_mg=cap.baseline_ax_mg,
        baseline_ay_mg=cap.baseline_ay_mg,
        baseline_az_mg=cap.baseline_az_mg,
        variance_mg2=cap.variance_mg2,
        sample_count=cap.sample_count,
        duration_ms=cap.duration_ms,
        quality=cap.quality,
        config_version=cap.config_version,
    )
    db.add(new_cap)

    # 6. 台帳 (Sensor) が存在する場合は座標と設置メタデータを最新化
    sensor = db.scalar(select(Sensor).where(Sensor.sensor_code == req.node_id))
    if sensor:
        sensor.latitude = Decimal(str(req.latitude))
        sensor.longitude = Decimal(str(req.longitude))
        sensor.installed_at = req.installed_at
        sensor.position_accuracy_m = (
            Decimal(str(req.position_accuracy_m)) if req.position_accuracy_m is not None else None
        )
        sensor.identity_method = req.identity_method
        sensor.position_method = req.position_method

    now_utc = datetime.now(UTC)
    response = InstallationConfirmResponse(
        status="confirmed",
        request_id=req.request_id,
        node_id=req.node_id,
        installation_id=req.installation_id,
        capture_id=cap.capture_id,
        confirmed_at=now_utc,
        message="設置および基準姿勢を正常に確定しました",
    )

    # 7. 冪等要求ログの永続化
    log_entry = SyncRequestLog(
        request_id=req.request_id,
        node_id=req.node_id,
        payload_hash=payload_hash,
        status_code=status.HTTP_200_OK,
        response_body=response.model_dump_json(),
        created_at=now_utc,
    )
    db.add(log_entry)

    db.commit()
    return response


@router.get(
    "/status/{request_id}",
    response_model=InstallationStatusResponse,
    summary="同期要求状態の照会",
)
def get_installation_status(
    request_id: str,
    db: Annotated[Session, Depends(get_db_session)],
) -> InstallationStatusResponse:
    log_entry = db.scalar(select(SyncRequestLog).where(SyncRequestLog.request_id == request_id))
    if not log_entry:
        return InstallationStatusResponse(
            request_id=request_id,
            node_id="",
            status="not_found",
            installation_id=None,
            confirmed_at=None,
        )

    body = json.loads(log_entry.response_body)
    return InstallationStatusResponse(
        request_id=request_id,
        node_id=log_entry.node_id,
        status="confirmed" if log_entry.status_code == 200 else "conflict",
        installation_id=body.get("installation_id"),
        confirmed_at=datetime.fromisoformat(body["confirmed_at"])
        if "confirmed_at" in body
        else None,
    )


@router.get(
    "/nodes/{node_id}/active",
    summary="対象機体のアクティブ設置・基準取得情報",
)
def get_active_installation(
    node_id: str,
    db: Annotated[Session, Depends(get_db_session)],
) -> dict[str, object]:
    inst = db.scalar(
        select(Installation)
        .where(Installation.node_id == node_id, Installation.status == "active")
        .order_by(Installation.version.desc())
    )
    if not inst:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"機体 {node_id} の有効な設置レコードが存在しません",
        )

    cap = db.scalar(select(Capture).where(Capture.installation_id == inst.installation_id))
    return {
        "node_id": inst.node_id,
        "installation_id": inst.installation_id,
        "installed_at": inst.installed_at.isoformat(),
        "latitude": float(inst.latitude),
        "longitude": float(inst.longitude),
        "version": inst.version,
        "capture": {
            "capture_id": cap.capture_id,
            "baseline_ax_mg": cap.baseline_ax_mg,
            "baseline_ay_mg": cap.baseline_ay_mg,
            "baseline_az_mg": cap.baseline_az_mg,
            "variance_mg2": cap.variance_mg2,
            "quality": cap.quality,
            "config_version": cap.config_version,
        }
        if cap
        else None,
    }
