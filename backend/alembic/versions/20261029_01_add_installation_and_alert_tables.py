"""設置履歴・基準取得・冪等同期ログ・警報イベントテーブルを追加する。

Revision ID: 20261029_01
Revises: 20261027_01
Create Date: 2026-10-29
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20261029_01"
down_revision: str | None = "20261027_01"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. installations (設置履歴テーブル)
    op.create_table(
        "installations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("installation_id", sa.String(80), nullable=False, unique=True),
        sa.Column("node_id", sa.String(80), nullable=False),
        sa.Column("request_id", sa.String(36), nullable=False),
        sa.Column("installed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("latitude", sa.Numeric(10, 7), nullable=False),
        sa.Column("longitude", sa.Numeric(10, 7), nullable=False),
        sa.Column("position_accuracy_m", sa.Numeric(8, 2), nullable=True),
        sa.Column("identity_method", sa.String(32), nullable=True),
        sa.Column("position_method", sa.String(32), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="active"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_installations_node_id_status",
        "installations",
        ["node_id", "status"],
    )

    # 2. captures (基準姿勢レコードテーブル)
    op.create_table(
        "captures",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("capture_id", sa.String(80), nullable=False, unique=True),
        sa.Column(
            "installation_id",
            sa.String(80),
            sa.ForeignKey("installations.installation_id"),
            nullable=False,
        ),
        sa.Column("node_id", sa.String(80), nullable=False),
        sa.Column("baseline_ax_mg", sa.Integer(), nullable=False),
        sa.Column("baseline_ay_mg", sa.Integer(), nullable=False),
        sa.Column("baseline_az_mg", sa.Integer(), nullable=False),
        sa.Column("variance_mg2", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("sample_count", sa.Integer(), nullable=False, server_default="20"),
        sa.Column("duration_ms", sa.Integer(), nullable=False, server_default="2000"),
        sa.Column("quality", sa.String(32), nullable=False, server_default="good"),
        sa.Column("config_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    # 3. sync_request_logs (冪等同期ログテーブル)
    op.create_table(
        "sync_request_logs",
        sa.Column("request_id", sa.String(36), primary_key=True),
        sa.Column("node_id", sa.String(80), nullable=False),
        sa.Column("payload_hash", sa.String(64), nullable=False),
        sa.Column("status_code", sa.Integer(), nullable=False, server_default="200"),
        sa.Column("response_body", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    # 4. alert_events (警報履歴テーブル)
    op.create_table(
        "alert_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("node_id", sa.String(80), nullable=False),
        sa.Column("installation_id", sa.String(80), nullable=True),
        sa.Column("capture_id", sa.String(80), nullable=True),
        sa.Column("tilt_degrees", sa.Numeric(6, 2), nullable=False),
        sa.Column("severity", sa.String(16), nullable=False, server_default="caution"),
        sa.Column("status", sa.String(16), nullable=False, server_default="active"),
        sa.Column("reason", sa.String(255), nullable=False),
        sa.Column("triggered_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_alert_events_node_id_status",
        "alert_events",
        ["node_id", "status"],
    )


def downgrade() -> None:
    op.drop_table("alert_events")
    op.drop_table("sync_request_logs")
    op.drop_table("captures")
    op.drop_table("installations")
