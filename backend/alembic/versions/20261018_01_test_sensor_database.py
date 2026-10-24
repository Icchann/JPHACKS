"""検証用センサー登録DBの初期テーブルを作成する。

Revision ID: 20261018_01
Revises:
Create Date: 2026-10-18
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20261018_01"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "sensors",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("sensor_code", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("latitude", sa.Numeric(precision=10, scale=7), nullable=False),
        sa.Column("longitude", sa.Numeric(precision=10, scale=7), nullable=False),
        sa.Column("device_external_id", sa.String(length=128), nullable=True),
        sa.Column("last_received_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("device_external_id"),
    )
    # 登録画面と同じく、センサーIDの英字大小だけが違う重複も拒否します。
    op.create_index(
        "uq_sensors_sensor_code_lower",
        "sensors",
        [sa.text("lower(sensor_code)")],
        unique=True,
    )
    op.create_table(
        "sensor_evaluation_states",
        sa.Column("sensor_id", sa.String(length=36), nullable=False),
        sa.Column(
            "observation_severity", sa.String(length=16), server_default="unknown", nullable=False
        ),
        sa.Column(
            "communication_status", sa.String(length=16), server_default="unknown", nullable=False
        ),
        sa.Column(
            "device_fault_status", sa.String(length=16), server_default="unknown", nullable=False
        ),
        sa.Column("low_battery", sa.Boolean(), nullable=True),
        sa.Column("last_evaluated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["sensor_id"], ["sensors.id"]),
        sa.PrimaryKeyConstraint("sensor_id"),
    )
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("actor_user_id", sa.String(length=36), nullable=True),
        sa.Column("action", sa.String(length=80), nullable=False),
        sa.Column("target_type", sa.String(length=80), nullable=False),
        sa.Column("target_id", sa.String(length=36), nullable=False),
        sa.Column("before_json", sa.JSON(), nullable=True),
        sa.Column("after_json", sa.JSON(), nullable=True),
        sa.Column(
            "occurred_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("sensor_evaluation_states")
    op.drop_index("uq_sensors_sensor_code_lower", table_name="sensors")
    op.drop_table("sensors")
