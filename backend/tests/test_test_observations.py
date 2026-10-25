import csv
from collections.abc import Iterator
from pathlib import Path
from typing import Literal

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings
from app.device.csv_store import CSV_COLUMNS
from app.main import app

client = TestClient(app)
TEST_TOKEN = "test-only-token"


@pytest.fixture(autouse=True)
def clear_dependency_override() -> Iterator[None]:
    yield
    app.dependency_overrides.clear()


def _use_settings(*, environment: Literal["dev", "test"], csv_path: Path) -> None:
    # 各テストで環境とCSVを明示し、開発環境の既定値へ影響させません。
    settings = Settings(
        app_environment=environment,
        observation_csv_path=csv_path,
        sanmou_test_api_token=TEST_TOKEN,
    )
    app.dependency_overrides[get_settings] = lambda: settings


def _write_csv(path: Path, rows: list[list[object]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as csv_file:
        writer = csv.writer(csv_file, lineterminator="\r\n")
        writer.writerow(CSV_COLUMNS)
        writer.writerows(rows)


def test_endpoint_is_hidden_in_dev_environment(tmp_path: Path) -> None:
    _use_settings(environment="dev", csv_path=tmp_path / "observations.csv")

    response = client.get("/test/observations")

    assert response.status_code == 404


def test_missing_csv_is_returned_as_waiting_state(tmp_path: Path) -> None:
    _use_settings(environment="test", csv_path=tmp_path / "observations.csv")

    response = client.get("/test/observations", headers={"X-Test-Token": TEST_TOKEN})

    assert response.status_code == 200
    assert response.json()["items"] == []
    assert response.json()["file_exists"] is False
    assert response.json()["source"] == "device_test"


def test_returns_valid_rows_and_preserves_acceleration_minus_one(tmp_path: Path) -> None:
    csv_path = tmp_path / "observations.csv"
    _write_csv(
        csv_path,
        [
            [
                "2026-09-30T18:30:11.171+09:00",
                "T1",
                247,
                0,
                672755,
                -1,
                0,
                96,
                -1,
                -1,
                "S0,T1,247,0,672755,-1,0,96,-1,-1",
            ],
            [
                "2026-09-30T18:31:11.171+09:00",
                "T2",
                12,
                0,
                2000,
                100,
                200,
                300,
                812,
                3710,
                "S0,T2,12,0,2000,100,200,300,812,3710",
            ],
            ["invalid-row"],
        ],
    )
    _use_settings(environment="test", csv_path=csv_path)

    response = client.get(
        "/test/observations",
        params={"node_id": "T1", "limit": 1},
        headers={"X-Test-Token": TEST_TOKEN},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["invalid_row_count"] == 1
    assert body["items"] == [
        {
            "received_at": "2026-09-30T18:30:11.171000+09:00",
            "node_id": "T1",
            "seq": 247,
            "hop": 0,
            "sample_ms": 672755,
            "ax_mg": -1,
            "ay_mg": 0,
            "az_mg": 96,
            "soil_raw": None,
            "battery_mv": None,
        }
    ]


def test_rejects_an_incompatible_header(tmp_path: Path) -> None:
    csv_path = tmp_path / "observations.csv"
    csv_path.write_text("wrong,header\r\n1,2\r\n", encoding="utf-8")
    _use_settings(environment="test", csv_path=csv_path)

    response = client.get("/test/observations", headers={"X-Test-Token": TEST_TOKEN})

    assert response.status_code == 500
    assert "ヘッダー" in response.json()["error"]["message"]


def test_rejects_a_request_without_test_token(tmp_path: Path) -> None:
    _use_settings(environment="test", csv_path=tmp_path / "observations.csv")

    response = client.get("/test/observations")

    assert response.status_code == 401


def test_clear_test_observations(tmp_path: Path) -> None:
    csv_path = tmp_path / "observations.csv"
    _use_settings(environment="test", csv_path=csv_path)
    _write_csv(
        csv_path,
        [
            [
                "2026-09-30T18:30:11.171+09:00",
                "T1",
                1,
                0,
                3115,
                -128,
                -176,
                928,
                -1,
                -1,
                "S0,T1,1,0,3115,-128,-176,928,-1,-1",
            ],
        ],
    )
    # 削除前
    res_before = client.get("/test/observations", headers={"X-Test-Token": TEST_TOKEN})
    assert len(res_before.json()["items"]) == 1

    # DELETE でクリア
    del_res = client.delete("/test/observations", headers={"X-Test-Token": TEST_TOKEN})
    assert del_res.status_code == 204

    # 削除後（アイテムが空であること）
    res_after = client.get("/test/observations", headers={"X-Test-Token": TEST_TOKEN})
    assert len(res_after.json()["items"]) == 0
