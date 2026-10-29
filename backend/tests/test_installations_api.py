"""設置・BLE基準取得一括確定API (Issue #59) の単体テスト"""

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.config import Settings, get_settings
from app.db.base import Base
from app.db.session import get_engine, get_session_factory
from app.main import app
from app.models.installation import Capture, Installation
from app.models.sensor import Sensor

TEST_TOKEN = "sanmou-test-admin-token"


@pytest.fixture
def installation_client(tmp_path: Path) -> Iterator[tuple[TestClient, str]]:
    database_url = f"sqlite+pysqlite:///{(tmp_path / 'installations.sqlite3').as_posix()}"
    settings = Settings(
        app_environment="test",
        database_url=database_url,
        sanmou_test_api_token=TEST_TOKEN,
    )
    engine = get_engine(database_url)
    Base.metadata.create_all(engine)
    session_factory = get_session_factory(database_url)

    # テスト対象センサー T1 を事前作成
    with session_factory() as session:
        session.add(
            Sensor(
                sensor_code="T1",
                name="テスト樹木ノードT1",
                latitude=35.0,
                longitude=137.0,
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


def test_confirm_installation_success(
    installation_client: tuple[TestClient, str],
) -> None:
    client, database_url = installation_client
    payload = {
        "request_id": "a1b2c3d4-e5f6-47a8-b9c0-112233445566",
        "node_id": "T1",
        "installation_id": "inst_T1_test_001",
        "installed_at": "2026-10-29T10:00:00Z",
        "latitude": 35.1234567,
        "longitude": 137.9876543,
        "position_accuracy_m": 3.5,
        "identity_method": "web_nfc",
        "position_method": "gps",
        "capture": {
            "capture_id": "cap_T1_test_001",
            "baseline_ax_mg": -120,
            "baseline_ay_mg": -95,
            "baseline_az_mg": 985,
            "variance_mg2": 40,
            "sample_count": 20,
            "duration_ms": 2000,
            "quality": "good",
            "config_version": 1,
        },
        "expected_version": 1,
    }

    res = client.post(
        "/api/v1/installations/confirm",
        json=payload,
        headers={"X-Test-Token": TEST_TOKEN},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "confirmed"
    assert data["installation_id"] == "inst_T1_test_001"
    assert data["capture_id"] == "cap_T1_test_001"

    session_factory = get_session_factory(database_url)
    with session_factory() as session:
        inst = session.scalar(
            select(Installation).where(Installation.installation_id == "inst_T1_test_001")
        )
        assert inst is not None
        assert inst.status == "active"
        assert inst.version == 1

        cap = session.scalar(select(Capture).where(Capture.capture_id == "cap_T1_test_001"))
        assert cap is not None
        assert cap.baseline_az_mg == 985

        sensor = session.scalar(select(Sensor).where(Sensor.sensor_code == "T1"))
        assert sensor is not None
        assert float(sensor.latitude) == 35.1234567

    # 状態照会APIの確認
    status_res = client.get(
        "/api/v1/installations/status/a1b2c3d4-e5f6-47a8-b9c0-112233445566",
        headers={"X-Test-Token": TEST_TOKEN},
    )
    assert status_res.status_code == 200
    assert status_res.json()["status"] == "confirmed"
    assert status_res.json()["installation_id"] == "inst_T1_test_001"

    # アクティブ設置取得APIの確認
    active_res = client.get(
        "/api/v1/installations/nodes/T1/active",
        headers={"X-Test-Token": TEST_TOKEN},
    )
    assert active_res.status_code == 200
    assert active_res.json()["installation_id"] == "inst_T1_test_001"
    assert active_res.json()["capture"]["baseline_az_mg"] == 985


def test_confirm_installation_idempotent_replay(
    installation_client: tuple[TestClient, str],
) -> None:
    client, _ = installation_client
    payload = {
        "request_id": "b2c3d4e5-f6a7-48b9-c0d1-223344556677",
        "node_id": "T1",
        "installation_id": "inst_T1_test_idemp",
        "installed_at": "2026-10-29T10:05:00Z",
        "latitude": 35.12,
        "longitude": 137.98,
        "capture": {
            "capture_id": "cap_T1_test_idemp",
            "baseline_ax_mg": 10,
            "baseline_ay_mg": 20,
            "baseline_az_mg": 995,
            "variance_mg2": 15,
            "sample_count": 20,
            "duration_ms": 2000,
            "quality": "good",
            "config_version": 1,
        },
        "expected_version": 1,
    }

    res1 = client.post(
        "/api/v1/installations/confirm",
        json=payload,
        headers={"X-Test-Token": TEST_TOKEN},
    )
    assert res1.status_code == 200
    assert res1.json()["status"] == "confirmed"

    # 同一ペイロードで再送 -> already_confirmed で同一結果
    res2 = client.post(
        "/api/v1/installations/confirm",
        json=payload,
        headers={"X-Test-Token": TEST_TOKEN},
    )
    assert res2.status_code == 200
    assert res2.json()["status"] == "already_confirmed"
    assert res2.json()["installation_id"] == "inst_T1_test_idemp"


def test_confirm_installation_conflict_on_different_payload(
    installation_client: tuple[TestClient, str],
) -> None:
    client, _ = installation_client
    req_id = "c3d4e5f6-a7b8-49c0-d1e2-334455667788"
    payload1 = {
        "request_id": req_id,
        "node_id": "T1",
        "installation_id": "inst_T1_orig",
        "installed_at": "2026-10-29T10:10:00Z",
        "latitude": 35.0,
        "longitude": 137.0,
        "capture": {
            "capture_id": "cap_T1_orig",
            "baseline_ax_mg": 0,
            "baseline_ay_mg": 0,
            "baseline_az_mg": 1000,
            "variance_mg2": 10,
            "sample_count": 20,
            "duration_ms": 2000,
            "quality": "good",
            "config_version": 1,
        },
        "expected_version": 1,
    }
    res1 = client.post(
        "/api/v1/installations/confirm",
        json=payload1,
        headers={"X-Test-Token": TEST_TOKEN},
    )
    assert res1.status_code == 200

    # 同一 request_id で異なる座標を送信 -> 409 Conflict
    payload2 = dict(payload1)
    payload2["latitude"] = 36.0
    res2 = client.post(
        "/api/v1/installations/confirm",
        json=payload2,
        headers={"X-Test-Token": TEST_TOKEN},
    )
    assert res2.status_code == 409
    assert "同一request_id" in res2.json()["error"]["message"]


def test_reject_zero_or_rejected_capture(
    installation_client: tuple[TestClient, str],
) -> None:
    client, _ = installation_client
    # 全軸ゼロ
    res_zero = client.post(
        "/api/v1/installations/confirm",
        json={
            "request_id": "d4e5f6a7-b8c9-40d1-e2f3-445566778899",
            "node_id": "T1",
            "installation_id": "inst_zero",
            "installed_at": "2026-10-29T10:15:00Z",
            "latitude": 35.0,
            "longitude": 137.0,
            "capture": {
                "capture_id": "cap_zero",
                "baseline_ax_mg": 0,
                "baseline_ay_mg": 0,
                "baseline_az_mg": 0,
                "variance_mg2": 0,
                "sample_count": 20,
                "duration_ms": 2000,
                "quality": "good",
                "config_version": 1,
            },
            "expected_version": 1,
        },
        headers={"X-Test-Token": TEST_TOKEN},
    )
    assert res_zero.status_code == 400
    assert "全軸ゼロ" in res_zero.json()["error"]["message"]
