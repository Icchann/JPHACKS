import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Sensor(Base):
    __tablename__ = "sensors"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    sensor_code: Mapped[str] = mapped_column(String(80), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    latitude: Mapped[Decimal] = mapped_column(Numeric(10, 7), nullable=False)
    longitude: Mapped[Decimal] = mapped_column(Numeric(10, 7), nullable=False)
    device_external_id: Mapped[str | None] = mapped_column(String(128), unique=True)
    last_received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    installed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    position_accuracy_m: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    identity_method: Mapped[str | None] = mapped_column(String(32))
    position_method: Mapped[str | None] = mapped_column(String(32))
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    evaluation_state: Mapped["SensorEvaluationState"] = relationship(
        back_populates="sensor", cascade="all, delete-orphan", uselist=False
    )


class SensorEvaluationState(Base):
    __tablename__ = "sensor_evaluation_states"

    sensor_id: Mapped[str] = mapped_column(String(36), ForeignKey("sensors.id"), primary_key=True)
    observation_severity: Mapped[str] = mapped_column(String(16), nullable=False, default="unknown")
    communication_status: Mapped[str] = mapped_column(String(16), nullable=False, default="unknown")
    device_fault_status: Mapped[str] = mapped_column(String(16), nullable=False, default="unknown")
    low_battery: Mapped[bool | None] = mapped_column(Boolean)
    last_evaluated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    sensor: Mapped[Sensor] = relationship(back_populates="evaluation_state")


# UIとAPIの重複判定に合わせ、英字の大文字小文字を区別しません。
Index("uq_sensors_sensor_code_lower", func.lower(Sensor.sensor_code), unique=True)
