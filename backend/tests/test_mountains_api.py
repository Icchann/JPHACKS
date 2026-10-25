from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings
from app.db.base import Base
from app.db.session import get_engine, get_session_factory
from app.main import app


@pytest.fixture
def mountain_client(tmp_path: Path) -> Iterator[TestClient]:
    database_url = f"sqlite+pysqlite:///{(tmp_path / 'mountains.sqlite3').as_posix()}"
    settings = Settings(
        app_environment="test",
        database_url=database_url,
    )
    engine = get_engine(database_url)
    Base.metadata.create_all(engine)
    app.dependency_overrides[get_settings] = lambda: settings
    try:
        with TestClient(app) as client:
            yield client
    finally:
        app.dependency_overrides.clear()
        engine.dispose()
        get_session_factory.cache_clear()
        get_engine.cache_clear()


def test_create_and_list_mountains(mountain_client: TestClient) -> None:
    # 1. 初期状態の一覧を取得
    res = mountain_client.get("/mountains")
    assert res.status_code == 200
    assert res.json() == {"items": []}

    # 2. 新しい山林工区（御在所岳）を登録
    payload = {
        "name": "御在所岳",
        "area_name": "本谷・一ノ谷工区",
        "description": "鈴鹿山脈主峰。急傾斜地すべり危険箇所。",
        "min_latitude": 35.0080,
        "max_latitude": 35.0250,
        "min_longitude": 136.4150,
        "max_longitude": 136.4550,
        "map_image_url": "/maps/gozaisyo_toukousen.png",
    }
    create_res = mountain_client.post("/mountains", json=payload)
    assert create_res.status_code == 201
    created = create_res.json()
    assert created["name"] == "御在所岳"
    assert created["area_name"] == "本谷・一ノ谷工区"
    assert created["map_image_url"] == "/maps/gozaisyo_toukousen.png"
    assert created["min_latitude"] == 35.0080

    # 3. 再度一覧を取得して反映されていることを確認
    list_res = mountain_client.get("/mountains")
    assert list_res.status_code == 200
    items = list_res.json()["items"]
    assert len(items) == 1
    assert items[0]["id"] == created["id"]


@pytest.mark.parametrize(
    ("min_lat", "max_lat", "min_lng", "max_lng"),
    [
        (35.0250, 35.0080, 136.4150, 136.4550),
        (35.0080, 35.0080, 136.4150, 136.4550),
        (35.0080, 35.0250, 136.4550, 136.4150),
        (35.0080, 35.0250, 136.4150, 136.4150),
    ],
)
def test_rejects_inverted_or_equal_coordinate_bounds(
    mountain_client: TestClient,
    min_lat: float,
    max_lat: float,
    min_lng: float,
    max_lng: float,
) -> None:
    payload = {
        "name": "御在所岳",
        "area_name": "本谷・一ノ谷工区",
        "min_latitude": min_lat,
        "max_latitude": max_lat,
        "min_longitude": min_lng,
        "max_longitude": max_lng,
    }

    res = mountain_client.post("/mountains", json=payload)

    assert res.status_code == 422
