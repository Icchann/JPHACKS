"""現場BLE基準取得→圏外保存→PC同期→LoRa姿勢変化検知の統合通し試験 (Issue #63, #52)

設計意図:
山林現場でのNFC機体識別から、BLE静止基準取得、圏外端末保存、
帰社後PCへの冪等確定同期、およびLoRa受信からのバックグラウンド姿勢変化判定・
警報ラッチ・解除までの一連のE2Eパイプラインが設計通り動作することを検証する。
"""

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.config import Settings, get_settings
from app.db.base import Base
from app.db.session import get_engine, get_session_factory
from app.device.posture_evaluator import evaluate_sensor_observation
from app.device.protocol import parse_serial_line
from app.main import app
from app.models.installation import Capture, Installation
from app.models.sensor import Sensor

TEST_TOKEN = "sanmou-test-admin-token"


@pytest.fixture
def e2e_env(tmp_path: Path) -> Iterator[tuple[TestClient, str]]:
    database_url = f"sqlite+pysqlite:///{(tmp_path / 'e2e.sqlite3').as_posix()}"
    settings = Settings(
        app_environment="test",
        database_url=database_url,
        sanmou_test_api_token=TEST_TOKEN,
    )
    engine = get_engine(database_url)
    Base.metadata.create_all(engine)
    session_factory = get_session_factory(database_url)

    # 初期機体 T1 を台帳に追加
    with session_factory() as session:
        session.add(
            Sensor(
                sensor_code="T1",
                name="山林観測ノードT1",
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


def test_full_pipeline_field_to_pc_monitoring(
    e2e_env: tuple[TestClient, str],
) -> None:
    client, database_url = e2e_env
    session_factory = get_session_factory(database_url)

    # -------------------------------------------------------------
    # 1. 現場スマホがBLEで基準取得し、帰社後PCへ同期 (Issue #57, #59, #60)
    # -------------------------------------------------------------
    req_id = "11111111-2222-3333-4444-555555555555"
    inst_id = "inst_T1_20261029_090000"
    cap_id = "cap_T1_still_good"

    confirm_payload = {
        "request_id": req_id,
        "node_id": "T1",
        "installation_id": inst_id,
        "installed_at": "2026-10-29T09:00:00Z",
        "latitude": 35.1234567,
        "longitude": 137.9876543,
        "position_accuracy_m": 3.8,
        "identity_method": "web_nfc",
        "position_method": "gps",
        "capture": {
            "capture_id": cap_id,
            "baseline_ax_mg": 0,
            "baseline_ay_mg": 0,
            "baseline_az_mg": 1000,
            "variance_mg2": 20,
            "sample_count": 20,
            "duration_ms": 2000,
            "quality": "good",
            "config_version": 1,
        },
        "expected_version": 1,
    }

    # PCへの確定同期リクエスト
    sync_res = client.post(
        "/api/v1/installations/confirm",
        json=confirm_payload,
        headers={"X-Test-Token": TEST_TOKEN},
    )
    assert sync_res.status_code == 200
    assert sync_res.json()["status"] == "confirmed"

    # 冪等性の検証 (同一要求を再送しても二重登録されず already_confirmed が返ること)
    replay_res = client.post(
        "/api/v1/installations/confirm",
        json=confirm_payload,
        headers={"X-Test-Token": TEST_TOKEN},
    )
    assert replay_res.status_code == 200
    assert replay_res.json()["status"] == "already_confirmed"

    # DBの確定確認
    with session_factory() as session:
        inst = session.scalar(select(Installation).where(Installation.installation_id == inst_id))
        assert inst is not None
        assert inst.status == "active"
        assert inst.version == 1

        cap = session.scalar(select(Capture).where(Capture.capture_id == cap_id))
        assert cap is not None
        assert cap.baseline_az_mg == 1000

    # -------------------------------------------------------------
    # 2. LoRaパケット (S1新形式) の受信と姿勢変化判定 (Issue #56, #61)
    # -------------------------------------------------------------
    # Case A: 設置直後の正常観測 (微小傾斜 1.5度)
    line_normal = f"S1,T1,{inst_id},b_01,1,0,1000,26,0,999,-1,3300,1"
    obs_normal = parse_serial_line(line_normal)
    assert obs_normal is not None

    with session_factory() as session:
        res_a = evaluate_sensor_observation(session, obs_normal)
        assert res_a.evaluated is True
        assert res_a.severity == "normal"
        assert res_a.alert_triggered is False

    # Case B: 風雨による傾斜検知 (20度傾き: X軸に342mg, Z軸に940mg) -> 注意警報 (caution) 発火
    line_tilted = f"S1,T1,{inst_id},b_01,2,0,2500,342,0,940,-1,3300,1"
    obs_tilted = parse_serial_line(line_tilted)
    assert obs_tilted is not None

    with session_factory() as session:
        res_b = evaluate_sensor_observation(session, obs_tilted)
        assert res_b.evaluated is True
        assert res_b.severity == "caution"
        assert res_b.alert_triggered is True

    # -------------------------------------------------------------
    # 3. 画面からの警報照会・消音・手動解除 (Issue #61, #62)
    # -------------------------------------------------------------
    # 発火中の警報一覧を取得
    alerts_res = client.get(
        "/api/v1/alerts/active",
        headers={"X-Test-Token": TEST_TOKEN},
    )
    assert alerts_res.status_code == 200
    alerts = alerts_res.json()
    assert len(alerts) == 1
    assert alerts[0]["node_id"] == "T1"
    assert alerts[0]["severity"] == "caution"
    assert alerts[0]["status"] == "active"

    # 警報を確認・消音 (acknowledge)
    ack_res = client.post(
        "/api/v1/alerts/T1/acknowledge",
        headers={"X-Test-Token": TEST_TOKEN},
    )
    assert ack_res.status_code == 200
    assert ack_res.json()["action"] == "acknowledged"

    # 警報を手動解除 (clear)
    clear_res = client.post(
        "/api/v1/alerts/T1/clear",
        headers={"X-Test-Token": TEST_TOKEN},
    )
    assert clear_res.status_code == 200
    assert clear_res.json()["action"] == "cleared"

    # 解除後、発火中警報は0件になること
    active_after = client.get(
        "/api/v1/alerts/active",
        headers={"X-Test-Token": TEST_TOKEN},
    )
    assert len(active_after.json()) == 0

    # 警報解除後も、基準姿勢（Capture）は書き換わらず元データを維持していること
    with session_factory() as session:
        cap_after = session.scalar(select(Capture).where(Capture.node_id == "T1"))
        assert cap_after is not None
        assert cap_after.baseline_az_mg == 1000

    # -------------------------------------------------------------
    # 4. 再設置 (inst_002) による世代交代と旧設置のsuperseded化 (Issue #59)
    # -------------------------------------------------------------
    inst_id_2 = "inst_T1_20261029_150000"
    reinstall_payload = dict(confirm_payload)
    reinstall_payload["request_id"] = "99999999-8888-7777-6666-555555555555"
    reinstall_payload["installation_id"] = inst_id_2
    reinstall_payload["expected_version"] = 1  # version 1 を更新
    reinstall_payload["capture"] = {
        "capture_id": "cap_T1_new_still",
        "baseline_ax_mg": 50,
        "baseline_ay_mg": 30,
        "baseline_az_mg": 995,
        "variance_mg2": 15,
        "sample_count": 20,
        "duration_ms": 2000,
        "quality": "good",
        "config_version": 1,
    }

    reinstall_res = client.post(
        "/api/v1/installations/confirm",
        json=reinstall_payload,
        headers={"X-Test-Token": TEST_TOKEN},
    )
    assert reinstall_res.status_code == 200
    assert reinstall_res.json()["status"] == "confirmed"

    with session_factory() as session:
        # 旧設置が superseded になっていること
        old_inst = session.scalar(
            select(Installation).where(Installation.installation_id == inst_id)
        )
        assert old_inst is not None
        assert old_inst.status == "superseded"

        # 新設置が active かつ version 2 になっていること
        new_inst = session.scalar(
            select(Installation).where(Installation.installation_id == inst_id_2)
        )
        assert new_inst is not None
        assert new_inst.status == "active"
        assert new_inst.version == 2
