"""センサー設置記録メタデータ（設置日時・測位精度・識別方法・測位方法）カラムを追加する。

Revision ID: 20261027_01
Revises: 20261026_01
Create Date: 2026-10-27
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20261027_01"
down_revision: str | None = "20261026_01"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # センサー設置記録メタデータ（設置日時、測位精度、識別方法、測位方法）を追加 (Issue #47)
    op.add_column(
        "sensors",
        sa.Column("installed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "sensors",
        sa.Column("position_accuracy_m", sa.Numeric(8, 2), nullable=True),
    )
    op.add_column(
        "sensors",
        sa.Column("identity_method", sa.String(32), nullable=True),
    )
    op.add_column(
        "sensors",
        sa.Column("position_method", sa.String(32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("sensors", "position_method")
    op.drop_column("sensors", "identity_method")
    op.drop_column("sensors", "position_accuracy_m")
    op.drop_column("sensors", "installed_at")
