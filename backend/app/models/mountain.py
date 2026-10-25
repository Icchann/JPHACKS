import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Mountain(Base):
    """山林・観測工区モデル。

    世の中のGIS標準（Ground Overlay方式）に基づき、
    名称・工区・緯度経度の境界範囲（Bounds）・下絵地図画像のパスを保持します。
    """

    __tablename__ = "mountains"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    area_name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)

    # 地図画像およびセンサー配置の境界座標（Bounds）
    min_latitude: Mapped[Decimal] = mapped_column(Numeric(10, 7), nullable=False)
    max_latitude: Mapped[Decimal] = mapped_column(Numeric(10, 7), nullable=False)
    min_longitude: Mapped[Decimal] = mapped_column(Numeric(10, 7), nullable=False)
    max_longitude: Mapped[Decimal] = mapped_column(Numeric(10, 7), nullable=False)

    # 森林基本図や等高線地形図の下絵画像パス（例: /maps/gozaisyo_toukousen.png）
    map_image_url: Mapped[str | None] = mapped_column(String(255))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
