from datetime import datetime
from typing import Literal

from pydantic import BaseModel

# 実証APIの型定義をpytestのテストクラス収集対象から除外します。
__test__ = False


class TestObservation(BaseModel):
    received_at: datetime
    node_id: str
    seq: int
    hop: int
    sample_ms: int
    ax_mg: int
    ay_mg: int
    az_mg: int
    soil_raw: int | None
    battery_mv: int | None


class TestObservationListResponse(BaseModel):
    items: list[TestObservation]
    file_exists: bool
    invalid_row_count: int
    source: Literal["device_test"] = "device_test"
    refreshed_at: datetime
