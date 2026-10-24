from secrets import compare_digest

from fastapi import Depends, Header, HTTPException

from app.core.config import Settings, get_settings


def require_test_admin(
    settings: Settings = Depends(get_settings),  # noqa: B008
    test_token: str | None = Header(default=None, alias="X-Test-Token"),  # noqa: B008
) -> None:
    """認証基盤確定前のtest環境だけで管理APIを保護する。"""

    if settings.app_environment != "test":
        raise HTTPException(status_code=404, detail="Not Found")
    if not settings.sanmou_test_api_token:
        raise HTTPException(status_code=503, detail="test API token is not configured")
    if test_token is None or not compare_digest(test_token, settings.sanmou_test_api_token):
        raise HTTPException(status_code=401, detail="Unauthorized")
