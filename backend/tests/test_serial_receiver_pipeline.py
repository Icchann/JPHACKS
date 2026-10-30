"""シリアル実受信入口（SerialObservationReceiver）を通すエンドツーエンド結合テスト (Issue #72, #73)

設計意図:
モジュールや判定関数の直接呼び出しではなく、
USBシリアルからの生バイト列（O2/S1/S0形式）を SerialObservationReceiver.receive() へフィードし、
1. CRLFバッファ処理
2. パケットパーサー（protocol.py）
3. CSV追記保存（csv_store.py）
4. リアルタイム常駐判定エンジン（posture_evaluator.py）
5. SQLiteの alert_events および sensor_evaluation_states 更新
が一連のパイプラインとして実入口から確実に連動することを検証する。
"""

from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path

import pytest
from sqlalchemy import select

from app.core.config import Settings
from app.db.base import Base
from app.db.session import get_engine, get_session_factory
from app.device.csv_store import ObservationCsvStore
from app.device.posture_evaluator import evaluate_sensor_observation
from app.device.protocol import SerialObservation
from app.device.receiver import SerialObservationReceiver
from app.models.installation import AlertEvent, Capture, Installation
from app.models.sensor import Sensor, SensorEvaluationState


@pytest.fixture
def receiver_pipeline_env(tmp_path: Path) -> Iterator[tuple[SerialObservationReceiver, str]]:
    database_url = f"sqlite+pysqlite:///{(tmp_path / 'pipeline.sqlite3').as_posix()}"
    csv_path = tmp_path / "observations.csv"
    Settings(
        app_environment="test",
        database_url=database_url,
    )
    engine = get_engine(database_url)
    Base.metadata.create_all(engine)
    session_factory = get_session_factory(database_url)

    # 1. 設置確定機体 T1（基準姿勢: Z=1000mg）を事前準備
    with session_factory() as session:
        sensor = Sensor(
            sensor_code="T1",
            name="山林ノードT1",
            latitude=35.1,
            longitude=137.2,
        )
        session.add(sensor)
        session.flush()

        eval_state = SensorEvaluationState(
            sensor_id=sensor.id,
            observation_severity="unknown",
            communication_status="unknown",
            device_fault_status="unknown",
        )
        session.add(eval_state)

        inst = Installation(
            installation_id="inst_T1_live",
            node_id="T1",
            request_id="req_001",
            installed_at=datetime.now(UTC),
            latitude=35.1,
            longitude=137.2,
            status="active",
            version=1,
        )
        session.add(inst)

        cap = Capture(
            capture_id="cap_T1_live",
            installation_id="inst_T1_live",
            node_id="T1",
            baseline_ax_mg=0,
            baseline_ay_mg=0,
            baseline_az_mg=1000,
            variance_mg2=15,
            sample_count=50,
            duration_ms=2000,
            quality="good",
            config_version=1,
        )
        session.add(cap)
        session.commit()

    # 2. 実受信機と同じコールバック配線でレシーバーを初期化
    store = ObservationCsvStore(csv_path)

    def _on_observation_handler(obs: SerialObservation, received_at: datetime) -> None:
        with session_factory() as db:
            evaluate_sensor_observation(db, obs, evaluated_at=received_at)

    receiver = SerialObservationReceiver(
        store=store,
        now=lambda: datetime.now(UTC),
        on_observation=_on_observation_handler,
    )

    try:
        yield receiver, database_url
    finally:
        engine.dispose()
        get_session_factory.cache_clear()
        get_engine.cache_clear()


def test_serial_receiver_pipeline_with_o2_packet(
    receiver_pipeline_env: tuple[SerialObservationReceiver, str],
) -> None:
    receiver, database_url = receiver_pipeline_env
    session_factory = get_session_factory(database_url)

    # 1. 正常姿勢の O2 パケットを生バイト列としてシリアル受信
    chunk_normal = b"O2,T1,inst_T1_live,b_01,1,1000,0.25,0.50,999.75,-1,3300,a367q1\r\n"
    stats1 = receiver.receive(chunk_normal)
    assert stats1.saved_records == 1
    assert stats1.invalid_records == 0

    # DBの判定状態が normal かつ最終受信時刻が更新されていること
    with session_factory() as session:
        sensor = session.scalar(select(Sensor).where(Sensor.sensor_code == "T1"))
        assert sensor is not None
        assert sensor.last_received_at is not None
        assert sensor.evaluation_state.observation_severity == "normal"

        active_alerts = session.scalars(
            select(AlertEvent).where(AlertEvent.node_id == "T1", AlertEvent.status == "active")
        ).all()
        assert len(active_alerts) == 0

    # 2. 傾き約20度の O2 パケット（X=342mg, Z=940mg: 注意しきい値15度超過）を受信
    chunk_tilted = b"O2,T1,inst_T1_live,b_01,2,2500,342.10,0.00,940.20,-1,3300,a367q1\r\n"
    stats2 = receiver.receive(chunk_tilted)
    assert stats2.saved_records == 2

    # 実入口からの受信だけで alert_events に caution が自動発火・永続化されたことを検証
    with session_factory() as session:
        sensor = session.scalar(select(Sensor).where(Sensor.sensor_code == "T1"))
        assert sensor is not None
        assert sensor.evaluation_state.observation_severity == "caution"

        active_alerts = session.scalars(
            select(AlertEvent).where(AlertEvent.node_id == "T1", AlertEvent.status == "active")
        ).all()
        assert len(active_alerts) == 1
        assert active_alerts[0].severity == "caution"
        assert "注意しきい値" in active_alerts[0].reason


def test_serial_receiver_pipeline_rejects_unmatched_installation(
    receiver_pipeline_env: tuple[SerialObservationReceiver, str],
) -> None:
    receiver, database_url = receiver_pipeline_env
    session_factory = get_session_factory(database_url)

    # 異なる installation_id を持つパケットを受信した場合
    chunk_unmatched = b"O2,T1,inst_diff_other,b_01,1,1000,342.0,0.0,940.0,-1,3300,a367q1\r\n"
    stats = receiver.receive(chunk_unmatched)
    assert stats.saved_records == 1  # 生ログとしてはCSVへ保存される

    # しかしアクティブ設置と一致しないため、誤判定や誤警報は発行されないこと
    with session_factory() as session:
        active_alerts = session.scalars(
            select(AlertEvent).where(AlertEvent.node_id == "T1", AlertEvent.status == "active")
        ).all()
        assert len(active_alerts) == 0
