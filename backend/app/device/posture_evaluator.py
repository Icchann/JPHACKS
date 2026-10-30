"""PC常駐姿勢変化判定エンジンおよび警告ラッチ評価ロジック。

設計意図 (Issue #61, DEC-23):
1. ブラウザを閉じていても、LoRa受信パケットを確定設置（Installation）および基準（Capture）と照合し、
   重力ベクトルの内積から角度差を算出して変化判定を集約実行する。
2. 基準と同一設置ID・設定版の観測のみを対象とし、
   旧設置・別機体・全軸ゼロ・未計測による誤判定を防ぐ。
3. しきい値（注意: 15度、危険: 30度）と復帰ヒステリシス（2度）を設け、チャタリングを防止する。
4. 警告状態はSQLiteの `alert_events` に永続化し、確認・消音・解除操作と基準再設定を厳格に分離する。
"""

from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.device.protocol import SerialObservation, calculate_tilt_angle_deg
from app.models.installation import AlertEvent, Capture, Installation
from app.models.sensor import Sensor, SensorEvaluationState

# しきい値定数 (度)
DEFAULT_CAUTION_THRESHOLD_DEG = 15.0
DEFAULT_DANGER_THRESHOLD_DEG = 30.0
HYSTERESIS_RECOVERY_DEG = 2.0


@dataclass(frozen=True, slots=True)
class PostureEvaluationResult:
    """姿勢変化評価結果。"""

    node_id: str
    evaluated: bool
    tilt_degrees: float | None
    severity: Literal["normal", "caution", "danger", "unknown"]
    reason: str
    alert_triggered: bool
    alert_cleared: bool


def evaluate_sensor_observation(
    db: Session,
    observation: SerialObservation,
    evaluated_at: datetime | None = None,
    caution_threshold: float = DEFAULT_CAUTION_THRESHOLD_DEG,
    danger_threshold: float = DEFAULT_DANGER_THRESHOLD_DEG,
) -> PostureEvaluationResult:
    """受信した1件の観測レコードを現在のアクティブ基準と比較し、判定と警告永続化を行う。"""

    if evaluated_at is None:
        evaluated_at = datetime.now(UTC)

    # 1. 観測値の妥当性検査
    if not observation.is_valid_gravity_vector:
        return PostureEvaluationResult(
            node_id=observation.node_id,
            evaluated=False,
            tilt_degrees=None,
            severity="unknown",
            reason="観測レコードの加速度が健全な重力ベクトル範囲外（静止不良またはゼロ）です",
            alert_triggered=False,
            alert_cleared=False,
        )

    # 2. 対象機体のアクティブ設置と基準を取得
    inst = db.scalar(
        select(Installation)
        .where(Installation.node_id == observation.node_id, Installation.status == "active")
        .order_by(Installation.version.desc())
    )
    if not inst:
        return PostureEvaluationResult(
            node_id=observation.node_id,
            evaluated=False,
            tilt_degrees=None,
            severity="unknown",
            reason="対象機体の確定設置レコード（Installation）が存在しません",
            alert_triggered=False,
            alert_cleared=False,
        )

    cap = db.scalar(select(Capture).where(Capture.installation_id == inst.installation_id))
    if not cap:
        return PostureEvaluationResult(
            node_id=observation.node_id,
            evaluated=False,
            tilt_degrees=None,
            severity="unknown",
            reason="対象設置の基準姿勢レコード（Capture）が存在しません",
            alert_triggered=False,
            alert_cleared=False,
        )

    # 3. 設置IDおよび測定設定版の一致検証 (旧形式や別設定を誤判定しない: Issue #72)
    if observation.installation_id is None:
        return PostureEvaluationResult(
            node_id=observation.node_id,
            evaluated=False,
            tilt_degrees=None,
            severity="unknown",
            reason="観測パケットに設置ID（installation_id）が含まれていません（旧形式または未確定）",
            alert_triggered=False,
            alert_cleared=False,
        )
    if observation.installation_id != inst.installation_id:
        return PostureEvaluationResult(
            node_id=observation.node_id,
            evaluated=False,
            tilt_degrees=None,
            severity="unknown",
            reason=(
                f"観測パケットの設置ID ({observation.installation_id}) が"
                f"現在のアクティブ設置ID ({inst.installation_id}) と一致しません"
            ),
            alert_triggered=False,
            alert_cleared=False,
        )
    if observation.config_version != cap.config_version:
        return PostureEvaluationResult(
            node_id=observation.node_id,
            evaluated=False,
            tilt_degrees=None,
            severity="unknown",
            reason=(
                f"観測パケットの設定版 ({observation.config_version}) が"
                f"基準の設定版 ({cap.config_version}) と一致しません"
            ),
            alert_triggered=False,
            alert_cleared=False,
        )
    # 4. 角度差の計算 (重力ベクトルの内積)
    tilt_deg = calculate_tilt_angle_deg(
        float(observation.ax_mg),
        float(observation.ay_mg),
        float(observation.az_mg),
        float(cap.baseline_ax_mg),
        float(cap.baseline_ay_mg),
        float(cap.baseline_az_mg),
    )
    if tilt_deg is None:
        return PostureEvaluationResult(
            node_id=observation.node_id,
            evaluated=False,
            tilt_degrees=None,
            severity="unknown",
            reason="基準ベクトルまたは観測ベクトルのノルムがゼロです",
            alert_triggered=False,
            alert_cleared=False,
        )

    # 5. 現在のアクティブ警告イベントを取得
    active_alert = db.scalar(
        select(AlertEvent)
        .where(AlertEvent.node_id == observation.node_id, AlertEvent.status == "active")
        .order_by(AlertEvent.triggered_at.desc())
    )

    severity: Literal["normal", "caution", "danger"] = "normal"
    reason = "基準姿勢からの傾き変化は許容範囲内です"
    alert_triggered = False
    alert_cleared = False

    if tilt_deg >= danger_threshold:
        severity = "danger"
        reason = (
            f"基準姿勢から {tilt_deg:.1f}° の傾斜を検知"
            f"（危険しきい値 {danger_threshold:.1f}° 超過）"
        )
    elif tilt_deg >= caution_threshold:
        severity = "caution"
        reason = (
            f"基準姿勢から {tilt_deg:.1f}° の傾斜を検知"
            f"（注意しきい値 {caution_threshold:.1f}° 超過）"
        )
    else:
        # 復帰判定 (ヒステリシス考慮: caution_threshold - HYSTERESIS_RECOVERY_DEG 未満で完全復帰)
        recovery_limit = caution_threshold - HYSTERESIS_RECOVERY_DEG
        if active_alert and tilt_deg < recovery_limit:
            active_alert.status = "cleared"
            active_alert.resolved_at = evaluated_at
            alert_cleared = True

    # 6. 新規警告イベントの発行
    if severity in ("caution", "danger"):
        if not active_alert or active_alert.severity != severity:
            if active_alert:
                active_alert.status = "cleared"
                active_alert.resolved_at = evaluated_at

            new_alert = AlertEvent(
                node_id=observation.node_id,
                installation_id=inst.installation_id,
                capture_id=cap.capture_id,
                tilt_degrees=Decimal(f"{tilt_deg:.2f}"),
                severity=severity,
                status="active",
                reason=reason,
                triggered_at=evaluated_at,
            )
            db.add(new_alert)
            alert_triggered = True

    # 7. 台帳（Sensor）および sensor_evaluation_states の観測重要度・最終受信を更新 (Issue #72)
    sensor = db.scalar(select(Sensor).where(Sensor.sensor_code == observation.node_id))
    if sensor:
        sensor.last_received_at = evaluated_at
        if sensor.evaluation_state:
            sensor.evaluation_state.observation_severity = severity
            sensor.evaluation_state.last_evaluated_at = evaluated_at
        else:
            new_eval = SensorEvaluationState(
                sensor_id=sensor.id,
                observation_severity=severity,
                communication_status="online",
                device_fault_status="ok",
                last_evaluated_at=evaluated_at,
            )
            db.add(new_eval)
    db.commit()

    return PostureEvaluationResult(
        node_id=observation.node_id,
        evaluated=True,
        tilt_degrees=round(tilt_deg, 2),
        severity=severity,
        reason=reason,
        alert_triggered=alert_triggered,
        alert_cleared=alert_cleared,
    )
