"""設置・BLE基準取得・冪等同期に関するデータ契約スキーマ定義。

山林現場でのBLE基準取得とPCへの持ち帰り同期において、
各識別子（request_id, installation_id, capture_id）と測定品質、
および冪等なAPI通信を保証するための型安全なPydanticモデルを提供する。
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class CaptureData(BaseModel):
    """機体が静止区間でサンプリングした不変の基準姿勢データ。"""

    capture_id: str = Field(..., min_length=1, max_length=80, description="基準取得固有ID")
    baseline_ax_mg: int = Field(..., ge=-4000, le=4000, description="X軸基準加速度(mg)")
    baseline_ay_mg: int = Field(..., ge=-4000, le=4000, description="Y軸基準加速度(mg)")
    baseline_az_mg: int = Field(..., ge=-4000, le=4000, description="Z軸基準加速度(mg)")
    variance_mg2: int = Field(..., ge=0, description="取得区間加速度の分散(品質指標)")
    sample_count: int = Field(..., ge=5, le=100, description="基準取得に用いた有効サンプル数")
    duration_ms: int = Field(..., ge=500, le=30000, description="サンプリング所要時間(ms)")
    quality: Literal["good", "acceptable", "rejected"] = Field(..., description="静止品質評価結果")
    config_version: int = Field(1, ge=1, description="測定設定・換算版番号")


class InstallationConfirmRequest(BaseModel):
    """現場スマホからPCへ持ち帰った設置・基準取得結果を一括確定する要求スキーマ。"""

    request_id: str = Field(..., min_length=36, max_length=36, description="冪等再送用UUIDv4")
    node_id: str = Field(..., min_length=1, max_length=64, description="対象機体コード")
    installation_id: str = Field(..., min_length=1, max_length=80, description="物理設置単位ID")
    installed_at: datetime = Field(..., description="現場での設置確定日時(UTC)")
    latitude: float = Field(..., ge=-90.0, le=90.0, description="設置緯度")
    longitude: float = Field(..., ge=-180.0, le=180.0, description="設置経度")
    position_accuracy_m: float | None = Field(None, ge=0.0, description="GPS測位精度(m)")
    identity_method: Literal["web_nfc", "url", "manual"] = Field(
        "web_nfc", description="機体識別手法"
    )
    position_method: Literal["gps", "manual", "demo_preset"] = Field(
        "gps", description="座標取得手法"
    )
    capture: CaptureData = Field(..., description="機体が確定した基準姿勢データ")
    expected_version: int = Field(1, ge=1, description="競合防止用期待世代番号")


class InstallationConfirmResponse(BaseModel):
    """設置確定APIの返却レスポンス。"""

    status: Literal["confirmed", "already_confirmed", "conflict"] = Field(
        ..., description="確定ステータス"
    )
    request_id: str = Field(..., description="要求ID")
    node_id: str = Field(..., description="機体コード")
    installation_id: str = Field(..., description="物理設置ID")
    capture_id: str = Field(..., description="基準取得ID")
    confirmed_at: datetime = Field(..., description="PC側確定保存日時(UTC)")
    message: str = Field(..., description="結果メッセージ")


class InstallationStatusResponse(BaseModel):
    """同期状態照会レスポンス。"""

    request_id: str = Field(..., description="照会対象要求ID")
    node_id: str = Field(..., description="機体コード")
    status: Literal["confirmed", "not_found", "conflict"] = Field(..., description="同期登録状態")
    installation_id: str | None = Field(None, description="紐づく設置ID")
    confirmed_at: datetime | None = Field(None, description="確定日時")
