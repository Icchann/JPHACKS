from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.schemas.common import ErrorDetail, ErrorResponse


def _response(status_code: int, code: str, message: str, details: dict[str, Any]) -> JSONResponse:
    body = ErrorResponse(error=ErrorDetail(code=code, message=message, details=details))
    return JSONResponse(status_code=status_code, content=body.model_dump(mode="json"))


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(StarletteHTTPException)
    async def handle_http_exception(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
        message = exc.detail if isinstance(exc.detail, str) else "リクエストを処理できません"
        return _response(exc.status_code, "HTTP_ERROR", message, {})

    @app.exception_handler(RequestValidationError)
    async def handle_validation_exception(
        _request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        # 入力値自体は返さず、検証箇所と理由だけを共通エラー形式へ変換します。
        errors = [
            {"location": list(error["loc"]), "message": error["msg"], "type": error["type"]}
            for error in exc.errors()
        ]
        return _response(422, "VALIDATION_ERROR", "入力内容を確認してください", {"errors": errors})
