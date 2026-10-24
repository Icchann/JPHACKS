from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class SensorCreate(BaseModel):
    sensor_code: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=120)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)

    @field_validator("sensor_code", "name")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        # 空白だけのIDや名称をDBへ保存しません。
        normalized = value.strip()
        if not normalized:
            raise ValueError("空白以外の文字を入力してください")
        return normalized


class SensorUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)

    @field_validator("name")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("空白以外の文字を入力してください")
        return normalized


class SensorResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    sensor_code: str
    name: str
    latitude: float
    longitude: float
    observation_severity: Literal["normal", "caution", "danger", "unknown"]
    communication_status: Literal["online", "offline", "unknown"]
    device_fault_status: Literal["ok", "fault", "unknown"]
    low_battery: bool | None
    last_received_at: datetime | None
    source: Literal["device_test"] = "device_test"


class SensorListResponse(BaseModel):
    items: list[SensorResponse]
    next_cursor: str | None
