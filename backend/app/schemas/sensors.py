from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.device.protocol import NODE_ID_PATTERN


class SensorCreate(BaseModel):
    sensor_code: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=120)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    installed_at: datetime | None = None
    position_accuracy_m: float | None = Field(default=None, ge=0, le=10000)
    identity_method: Literal["web_nfc", "url", "manual"] | None = None
    position_method: Literal["gps", "manual", "demo_preset"] | None = None

    @field_validator("sensor_code", "name")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        # 空白だけのIDや名称をDBへ保存しません。
        normalized = value.strip()
        if not normalized:
            raise ValueError("空白以外の文字を入力してください")
        return normalized

    @field_validator("sensor_code")
    @classmethod
    def validate_sensor_code_format(cls, value: str) -> str:
        # シリアル受信プロトコル（NODE_ID_PATTERN）と登録センサーIDの形式を一致させます。
        if not NODE_ID_PATTERN.fullmatch(value):
            raise ValueError(
                "センサーIDは半角英数字・ハイフン・アンダースコア（1〜64文字）で入力してください"
            )
        return value


class SensorUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    installed_at: datetime | None = None
    position_accuracy_m: float | None = Field(default=None, ge=0, le=10000)
    identity_method: Literal["web_nfc", "url", "manual"] | None = None
    position_method: Literal["gps", "manual", "demo_preset"] | None = None

    @field_validator("name")
    @classmethod
    def strip_required_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
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
    installed_at: datetime | None = None
    position_accuracy_m: float | None = None
    identity_method: str | None = None
    position_method: str | None = None
    source: Literal["device_test"] = "device_test"


class SensorListResponse(BaseModel):
    items: list[SensorResponse]
    next_cursor: str | None
