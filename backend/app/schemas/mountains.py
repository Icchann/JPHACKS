from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class MountainCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    area_name: str = Field(min_length=1, max_length=120)
    description: str | None = None
    min_latitude: float = Field(ge=-90, le=90)
    max_latitude: float = Field(ge=-90, le=90)
    min_longitude: float = Field(ge=-180, le=180)
    max_longitude: float = Field(ge=-180, le=180)
    map_image_url: str | None = Field(default=None, max_length=255)

    @field_validator("name", "area_name")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        # 空白だけの山林名や工区名をDBへ保存しません。
        normalized = value.strip()
        if not normalized:
            raise ValueError("空白以外の文字を入力してください")
        return normalized


class MountainResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    area_name: str
    description: str | None
    min_latitude: float
    max_latitude: float
    min_longitude: float
    max_longitude: float
    map_image_url: str | None
    created_at: datetime
    updated_at: datetime


class MountainListResponse(BaseModel):
    items: list[MountainResponse]
