"""白神山地 第3工区の初期シードデータを投入する。

Revision ID: 20261026_01
Revises: 20261025_02
Create Date: 2026-10-26
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20261026_01"
down_revision: str | None = "20261025_02"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # デモ・実機検証で標準使用する白神山地 第3工区のシードデータを追加
    mountains_table = sa.table(
        "mountains",
        sa.column("id", sa.String),
        sa.column("name", sa.String),
        sa.column("area_name", sa.String),
        sa.column("description", sa.Text),
        sa.column("min_latitude", sa.Numeric),
        sa.column("max_latitude", sa.Numeric),
        sa.column("min_longitude", sa.Numeric),
        sa.column("max_longitude", sa.Numeric),
        sa.column("map_image_url", sa.String),
    )

    op.bulk_insert(
        mountains_table,
        [
            {
                "id": "shirakami-03",
                "name": "白神山地",
                "area_name": "第3工区（北沢・東尾根）",
                "description": "急傾斜地すべり危険箇所指定区域。主作業道および集材架線が稼働中。",
                "min_latitude": 34.9850,
                "max_latitude": 35.0220,
                "min_longitude": 136.9820,
                "max_longitude": 137.0320,
                "map_image_url": None,
            }
        ],
    )


def downgrade() -> None:
    op.execute("DELETE FROM mountains WHERE id = 'shirakami-03'")
