import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db_session
from app.models.mountain import Mountain
from app.schemas.mountains import MountainCreate, MountainListResponse, MountainResponse

router = APIRouter(prefix="/mountains", tags=["mountains"])


def _response(mountain: Mountain) -> MountainResponse:
    return MountainResponse(
        id=mountain.id,
        name=mountain.name,
        area_name=mountain.area_name,
        description=mountain.description,
        min_latitude=float(mountain.min_latitude),
        max_latitude=float(mountain.max_latitude),
        min_longitude=float(mountain.min_longitude),
        max_longitude=float(mountain.max_longitude),
        map_image_url=mountain.map_image_url,
        created_at=mountain.created_at,
        updated_at=mountain.updated_at,
    )


@router.get(
    "",
    response_model=MountainListResponse,
    summary="山林・工区一覧の取得",
)
def list_mountains(
    session: Session = Depends(get_db_session),  # noqa: B008
) -> MountainListResponse:
    """登録されている山林工区（境界座標および下絵画像パス）を一覧取得する。"""
    mountains = session.scalars(select(Mountain).order_by(Mountain.created_at.asc())).all()
    return MountainListResponse(items=[_response(m) for m in mountains])


@router.post(
    "",
    response_model=MountainResponse,
    status_code=status.HTTP_201_CREATED,
    summary="新しい山林・工区の登録",
)
def create_mountain(
    payload: MountainCreate,
    session: Session = Depends(get_db_session),  # noqa: B008
) -> MountainResponse:
    """世の中のGIS標準（Ground Overlay方式）に基づき、新しい山林工区と下絵画像を登録する。"""
    mountain = Mountain(
        id=str(uuid.uuid4()),
        name=payload.name,
        area_name=payload.area_name,
        description=payload.description,
        min_latitude=Decimal(str(payload.min_latitude)),
        max_latitude=Decimal(str(payload.max_latitude)),
        min_longitude=Decimal(str(payload.min_longitude)),
        max_longitude=Decimal(str(payload.max_longitude)),
        map_image_url=payload.map_image_url,
    )
    session.add(mountain)
    session.commit()
    session.refresh(mountain)
    return _response(mountain)
