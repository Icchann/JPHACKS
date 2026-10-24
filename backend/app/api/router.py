from fastapi import APIRouter

from app.api.routes.health import router as health_router
from app.api.routes.sensors import router as sensors_router
from app.api.routes.test_observations import router as test_observations_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(sensors_router)
api_router.include_router(test_observations_router)
