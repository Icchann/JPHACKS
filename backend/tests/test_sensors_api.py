from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.core.config import Settings, get_settings
from app.db.base import Base
from app.db.session import get_engine, get_session_factory
from app.main import app
from app.models.audit_log import AuditLog

TEST_TOKEN = "test-sensor-admin-token"


@pytest.fixture
def sensor_client(tmp_path: Path) -> Iterator[tuple[TestClient, str]]:
    database_url = f"sqlite+pysqlite:///{(tmp_path / 'sensors.sqlite3').as_posix()}"
    settings = Settings(
        app_environment="test",
        database_url=database_url,
        sanmou_test_api_token=TEST_TOKEN,
    )
    engine = get_engine(database_url)
    Base.metadata.create_all(engine)
    app.dependency_overrides[get_settings] = lambda: settings
    try:
        with TestClient(app) as client:
            yield client, database_url
    finally:
        app.dependency_overrides.clear()
        engine.dispose()
        get_session_factory.cache_clear()
        get_engine.cache_clear()


def _headers() -> dict[str, str]:
    return {"X-Test-Token": TEST_TOKEN}


def _payload(sensor_code: str = "T1") -> dict[str, str | float]:
    return {
        "sensor_code": sensor_code,
        "name": "北沢 上流",
        "latitude": 35.0042,
        "longitude": 137.0091,
    }


def test_create_list_update_and_audit_sensor(
    sensor_client: tuple[TestClient, str],
) -> None:
    client, database_url = sensor_client

    created = client.post("/sensors", json=_payload(), headers=_headers())

    assert created.status_code == 201
    created_body = created.json()
    assert created_body["sensor_code"] == "T1"
    assert created_body["observation_severity"] == "unknown"
    assert created_body["communication_status"] == "unknown"
    assert created_body["source"] == "device_test"

    listed = client.get("/sensors", headers=_headers())
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()["items"]] == [created_body["id"]]

    updated = client.patch(
        f"/sensors/{created_body['id']}",
        json={"name": "北沢 最上流", "latitude": 35.1, "longitude": 137.2},
        headers=_headers(),
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "北沢 最上流"

    with get_session_factory(database_url)() as session:
        actions = list(session.scalars(select(AuditLog.action)))
        audit_count = session.scalar(select(func.count()).select_from(AuditLog))
    assert set(actions) == {"sensor.created", "sensor.updated"}
    assert audit_count == 2


def test_rejects_case_insensitive_duplicate_sensor_code(
    sensor_client: tuple[TestClient, str],
) -> None:
    client, _database_url = sensor_client
    assert client.post("/sensors", json=_payload("T1"), headers=_headers()).status_code == 201

    duplicate = client.post("/sensors", json=_payload("t1"), headers=_headers())

    assert duplicate.status_code == 409


def test_rejects_invalid_coordinate(sensor_client: tuple[TestClient, str]) -> None:
    client, _database_url = sensor_client
    payload = _payload()
    payload["latitude"] = 91

    response = client.post("/sensors", json=payload, headers=_headers())

    assert response.status_code == 422


def test_requires_test_token(sensor_client: tuple[TestClient, str]) -> None:
    client, _database_url = sensor_client

    response = client.get("/sensors")

    assert response.status_code == 401


def test_sensor_api_is_hidden_in_dev_environment(tmp_path: Path) -> None:
    database_url = f"sqlite+pysqlite:///{(tmp_path / 'dev.sqlite3').as_posix()}"
    settings = Settings(
        app_environment="dev",
        database_url=database_url,
        sanmou_test_api_token=TEST_TOKEN,
    )
    app.dependency_overrides[get_settings] = lambda: settings
    try:
        response = TestClient(app).get("/sensors", headers=_headers())
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 404


def test_delete_sensor_and_allow_re_registration(sensor_client: tuple[TestClient, str]) -> None:
    client, _database_url = sensor_client
    payload = _payload(sensor_code="T1-DEL")

    # 作成
    create_res = client.post("/sensors", json=payload, headers=_headers())
    assert create_res.status_code == 201
    sensor_id = create_res.json()["id"]

    # 削除
    del_res = client.delete(f"/sensors/{sensor_id}", headers=_headers())
    assert del_res.status_code == 204

    # 削除後は取得できないこと
    get_res = client.get(f"/sensors/{sensor_id}", headers=_headers())
    assert get_res.status_code == 404

    # 同じ sensor_code で再登録できること（一意制約エラーにならないこと）
    re_create_res = client.post("/sensors", json=payload, headers=_headers())
    assert re_create_res.status_code == 201
    assert re_create_res.json()["sensor_code"] == "T1-DEL"


@pytest.mark.parametrize(
    "invalid_code",
    [
        "T1 01",
        "T1@01",
        "センサー1",
        "A" * 65,
        "   ",
    ],
)
def test_rejects_invalid_sensor_code_format(
    sensor_client: tuple[TestClient, str],
    invalid_code: str,
) -> None:
    client, _database_url = sensor_client

    response = client.post("/sensors", json=_payload(sensor_code=invalid_code), headers=_headers())

    assert response.status_code == 422


def test_search_sensors_escapes_underscore_and_percent_wildcards(
    sensor_client: tuple[TestClient, str],
) -> None:
    client, _database_url = sensor_client
    assert client.post("/sensors", json=_payload("NODE_1"), headers=_headers()).status_code == 201
    assert client.post("/sensors", json=_payload("NODEA1"), headers=_headers()).status_code == 201

    res_underscore = client.get("/sensors", params={"q": "NODE_1"}, headers=_headers())
    assert res_underscore.status_code == 200
    assert [item["sensor_code"] for item in res_underscore.json()["items"]] == ["NODE_1"]

    res_percent = client.get("/sensors", params={"q": "100%"}, headers=_headers())
    assert res_percent.status_code == 200
    assert res_percent.json()["items"] == []


def test_sensor_installation_metadata_contract_and_audit(
    sensor_client: tuple[TestClient, str],
) -> None:
    client, database_url = sensor_client

    # 1. 設置日時・精度・識別方法・測位方法付きで登録
    install_payload = _payload("T10")
    install_payload.update(
        {
            "installed_at": "2026-10-27T08:30:00Z",
            "position_accuracy_m": 4.5,
            "identity_method": "web_nfc",
            "position_method": "gps",
        }
    )
    created = client.post("/sensors", json=install_payload, headers=_headers())
    assert created.status_code == 201
    body = created.json()
    assert body["sensor_code"] == "T10"
    assert body["position_accuracy_m"] == 4.5
    assert body["identity_method"] == "web_nfc"
    assert body["position_method"] == "gps"
    assert "2026-10-27T08:30:00" in body["installed_at"]

    # 2. 設置情報の更新
    patch_payload = {
        "latitude": 35.005,
        "longitude": 137.01,
        "installed_at": "2026-10-27T09:00:00Z",
        "position_accuracy_m": 2.1,
        "identity_method": "url",
        "position_method": "manual",
    }
    updated = client.patch(f"/sensors/{body['id']}", json=patch_payload, headers=_headers())
    assert updated.status_code == 200
    updated_body = updated.json()
    assert updated_body["position_accuracy_m"] == 2.1
    assert updated_body["identity_method"] == "url"
    assert updated_body["position_method"] == "manual"

    # 3. 監査ログに設置メタデータが記録されていること
    with get_session_factory(database_url)() as session:
        logs = list(session.scalars(select(AuditLog).where(AuditLog.target_id == body["id"])))
    assert len(logs) == 2
    created_log = next(log for log in logs if log.action == "sensor.created")
    updated_log = next(log for log in logs if log.action == "sensor.updated")
    assert created_log.after_json["identity_method"] == "web_nfc"
    assert created_log.after_json["position_accuracy_m"] == 4.5
    assert updated_log.after_json["identity_method"] == "url"
    assert updated_log.after_json["position_accuracy_m"] == 2.1
