"""PC常駐姿勢変化判定エンジンおよび警報管理API (Issue #61) の単体テスト"""

from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.config import Settings, get_settings
from app.db.base import Base
from app.db.session import get_engine, get_session_factory
from app.device.posture_evaluator import evaluate_sensor_observation
from app.device.protocol import SerialObservation
from app.main import app
from app.models.installation import Capture, Installation
from app.models.sensor import Sensor

TEST_TOKEN = "sanmou-test-admin-token"


@pytest.fixture
def evaluator_env(tmp_path: Path) -> Iterator[tuple[TestClient, str]]:
    database_url = f"sqlite+pysqlite:///{(tmp_path / 'eval.sqlite3').as_posix()}"
    settings = Settings(
        app_environment="test",
        database_url=database_url,
        sanmou_test_api_token=TEST_TOKEN,
    )
    engine = get_engine(database_url)
    Base.metadata.create_all(engine)
    session_factory = get_session_factory(database_url)

    # 機体 T1 と確定基準（Z軸上向き 1000mg）を事前準備
    with session_factory() as session:
        session.add(
            Sensor(
                sensor_code="T1",
                name="テスト樹木ノードT1",
                latitude=35.0,
                longitude=137.0,
            )
        )
        session.add(
            Installation(
                installation_id="inst_T1_test",
                node_id="T1",
                request_id="req_001",
                installed_at=datetime.now(UTC),
                latitude=35.0,
                longitude=137.0,
                status="active",
                version=1,
            )
        )
        session.add(
            Capture(
                capture_id="cap_T1_test",
                installation_id="inst_T1_test",
                node_id="T1",
                baseline_ax_mg=0,
                baseline_ay_mg=0,
                baseline_az_mg=1000,
                variance_mg2=10,
                sample_count=20,
                duration_ms=2000,
                quality="good",
                config_version=1,
            )
        )
        session.commit()

    app.dependency_overrides[get_settings] = lambda: settings
    try:
        with TestClient(app) as client:
            yield client, database_url
    finally:
        app.dependency_overrides.clear()
        engine.dispose()
        get_session_factory.cache_clear()
        get_engine.cache_clear()


def test_posture_evaluation_flow_and_alert_api(
    evaluator_env: tuple[TestClient, str],
) -> None:
    client, database_url = evaluator_env
    session_factory = get_session_factory(database_url)

    # 1. 正常観測 (傾き約0度) -> normal
    with session_factory() as session:
        obs_normal = SerialObservation(
            packet_type="S1",
            node_id="T1",
            seq=1,
            hop=0,
            sample_ms=1000,
            ax_mg=0,
            ay_mg=0,
            az_mg=1000,
            soil_raw=-1,
            battery_mv=3300,
            raw_line="S1,T1,inst_T1_test,b_01,1,0,1000,0,0,1000,-1,3300,1",
            installation_id="inst_T1_test",
            boot_id="b_01",
            config_version=1,
        )
        res_normal = evaluate_sensor_observation(session, obs_normal)
        assert res_normal.evaluated is True
        assert res_normal.severity == "normal"
        assert res_normal.alert_triggered is False

    # 2. 傾き約20度 (X軸に342mg, Z軸に940mg: sqrt(342^2+940^2)=1000, theta=20度) -> caution
    with session_factory() as session:
        obs_caution = SerialObservation(
            packet_type="S1",
            node_id="T1",
            seq=2,
            hop=0,
            sample_ms=2000,
            ax_mg=342,
            ay_mg=0,
            az_mg=940,
            soil_raw=-1,
            battery_mv=3300,
            raw_line="S1,T1,inst_T1_test,b_01,2,0,2000,342,0,940,-1,3300,1",
            installation_id="inst_T1_test",
            boot_id="b_01",
            config_version=1,
        )
        res_caution = evaluate_sensor_observation(session, obs_caution)
        assert res_caution.severity == "caution"
        assert res_caution.alert_triggered is True

    # 3. 警報一覧APIで active 警報が取得できること
    alert_list_res = client.get(
        "/api/v1/alerts/active",
        headers={"X-Test-Token": TEST_TOKEN},
    )
    assert alert_list_res.status_code == 200
    alerts = alert_list_res.json()
    assert len(alerts) == 1
    assert alerts[0]["node_id"] == "T1"
    assert alerts[0]["severity"] == "caution"
    assert alerts[0]["status"] == "active"

    # 4. 警報確認・消音 API の実行
    ack_res = client.post(
        "/api/v1/alerts/T1/acknowledge",
        headers={"X-Test-Token": TEST_TOKEN},
    )
    assert ack_res.status_code == 200
    assert ack_res.json()["action"] == "acknowledged"

    # 5. 手動解除 API の実行
    clear_res = client.post(
        "/api/v1/alerts/T1/clear",
        headers={"X-Test-Token": TEST_TOKEN},
    )
    assert clear_res.status_code == 200
    assert clear_res.json()["action"] == "cleared"

    # 解除後、active警報が0件になること
    active_after = client.get(
        "/api/v1/alerts/active",
        headers={"X-Test-Token": TEST_TOKEN},
    )
    assert len(active_after.json()) == 0

    # 基準姿勢（Capture）は維持されていること
    with session_factory() as session:
        cap = session.scalar(select(Capture).where(Capture.node_id == "T1"))
        assert cap is not None
        assert cap.baseline_az_mg == 1000
