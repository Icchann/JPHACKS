from fastapi import APIRouter

from app.schemas.common import ErrorResponse, HealthResponse

router = APIRouter(tags=["system"])


@router.get(
    "/health",
    response_model=HealthResponse,
    responses={500: {"model": ErrorResponse}},
)
async def health() -> HealthResponse:
    return HealthResponse(status="ok", service="sanmou-api")
