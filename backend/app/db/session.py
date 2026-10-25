from collections.abc import Iterator
from functools import lru_cache

from fastapi import Depends, HTTPException
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import Settings, get_settings

SQLITE_BUSY_TIMEOUT_SECONDS = 30


@lru_cache
def get_engine(database_url: str) -> Engine:
    # SQLite検証環境でもFastAPIの別スレッドから安全に接続できるようにします。
    connect_args = (
        {"check_same_thread": False, "timeout": SQLITE_BUSY_TIMEOUT_SECONDS}
        if database_url.startswith("sqlite")
        else {}
    )
    return create_engine(database_url, connect_args=connect_args, pool_pre_ping=True)


@lru_cache
def get_session_factory(database_url: str) -> sessionmaker[Session]:
    return sessionmaker(bind=get_engine(database_url), expire_on_commit=False)


def get_db_session(settings: Settings = Depends(get_settings)) -> Iterator[Session]:  # noqa: B008
    """設定済みDBへのリクエスト単位セッションを提供する。"""

    if not settings.database_url:
        raise HTTPException(status_code=503, detail="database is not configured")

    session = get_session_factory(settings.database_url)()
    try:
        yield session
    finally:
        session.close()
