"""設置履歴、静止基準レコード、冪等同期ログ、および警報履歴のSQLAlchemyモデル定義。

設計意図 (Issue #53, #59, #61, DEC-23):
1. 機体の物理設置（Installation）と不変の静止基準（Capture）を分離し、再設置履歴を安全に追跡する。
2. 同一 request_id の二重送信や競合を判定するため、SyncRequestLogで冪等性を保証する。
3. PC常駐判定エンジンが検知した姿勢変化・警告状態（AlertEvent）を永続化し、
   ブラウザを閉じても維持する。
"""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Index, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Installation(Base):
    """機体の物理的な現場取り付け履歴。再設置ごとに新設される。"""

    __tablename__ = "installations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    installation_id: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    node_id: Mapped[str] = mapped_column(String(80), nullable=False)
    request_id: Mapped[str] = mapped_column(String(36), nullable=False)
    installed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    latitude: Mapped[Decimal] = mapped_column(Numeric(10, 7), nullable=False)
    longitude: Mapped[Decimal] = mapped_column(Numeric(10, 7), nullable=False)
    position_accuracy_m: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    identity_method: Mapped[str | None] = mapped_column(String(32))
    position_method: Mapped[str | None] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    capture: Mapped["Capture | None"] = relationship(
        back_populates="installation", cascade="all, delete-orphan", uselist=False
    )


class Capture(Base):
    """機体が静止区間でサンプリングした不変の基準姿勢レコード。"""

    __tablename__ = "captures"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    capture_id: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    installation_id: Mapped[str] = mapped_column(
        String(80), ForeignKey("installations.installation_id"), nullable=False
    )
    node_id: Mapped[str] = mapped_column(String(80), nullable=False)
    baseline_ax_mg: Mapped[int] = mapped_column(Integer, nullable=False)
    baseline_ay_mg: Mapped[int] = mapped_column(Integer, nullable=False)
    baseline_az_mg: Mapped[int] = mapped_column(Integer, nullable=False)
    variance_mg2: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sample_count: Mapped[int] = mapped_column(Integer, nullable=False, default=20)
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=2000)
    quality: Mapped[str] = mapped_column(String(32), nullable=False, default="good")
    config_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    installation: Mapped[Installation] = relationship(back_populates="capture")


class SyncRequestLog(Base):
    """冪等同期要求の履歴。二重送信防止および再照会に使用する。"""

    __tablename__ = "sync_request_logs"

    request_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    node_id: Mapped[str] = mapped_column(String(80), nullable=False)
    payload_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    status_code: Mapped[int] = mapped_column(Integer, nullable=False, default=200)
    response_body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class AlertEvent(Base):
    """PC常駐判定エンジンによる姿勢変化・警報履歴。"""

    __tablename__ = "alert_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    node_id: Mapped[str] = mapped_column(String(80), nullable=False)
    installation_id: Mapped[str | None] = mapped_column(String(80))
    capture_id: Mapped[str | None] = mapped_column(String(80))
    tilt_degrees: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False)
    severity: Mapped[str] = mapped_column(String(16), nullable=False, default="caution")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active")
    reason: Mapped[str] = mapped_column(String(255), nullable=False)
    triggered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


Index("ix_installations_node_id_status", Installation.node_id, Installation.status)
Index("ix_alert_events_node_id_status", AlertEvent.node_id, AlertEvent.status)
