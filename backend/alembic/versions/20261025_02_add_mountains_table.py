"""山林工区（mountains）テーブルを追加し初期シードデータを投入する。

Revision ID: 20261025_02
Revises: 20261018_01
Create Date: 2026-10-25
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20261025_02"
down_revision: str | None = "20261018_01"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    mountains_table = op.create_table(
        "mountains",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("area_name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("min_latitude", sa.Numeric(precision=10, scale=7), nullable=False),
        sa.Column("max_latitude", sa.Numeric(precision=10, scale=7), nullable=False),
        sa.Column("min_longitude", sa.Numeric(precision=10, scale=7), nullable=False),
        sa.Column("max_longitude", sa.Numeric(precision=10, scale=7), nullable=False),
        sa.Column("map_image_url", sa.String(length=255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # 実機検証・デモ用の初期シードデータ（御在所岳 本谷・一ノ谷工区）を投入
    op.bulk_insert(
        mountains_table,
        [
            {
                "id": "gozaisyo-01",
                "name": "御在所岳",
                "area_name": "本谷・一ノ谷工区（ロープウェイ周辺）",
                "description": "鈴鹿山脈 主峰。急傾斜地すべり危険箇所指定区域。",
                "min_latitude": 35.0080,
                "max_latitude": 35.0250,
                "min_longitude": 136.4150,
                "max_longitude": 136.4550,
                "map_image_url": "/maps/gozaisyo_toukousen.png",
            }
        ],
    )


def downgrade() -> None:
    op.drop_table("mountains")
