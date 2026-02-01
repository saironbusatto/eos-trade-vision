"""add_regime_columns

Revision ID: 30992051d562
Revises: 9c25f293de51
Create Date: 2026-02-01 13:44:57.553287

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '30992051d562'
down_revision: Union[str, Sequence[str], None] = '9c25f293de51'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('signals', sa.Column('meta_adx', sa.Float(), nullable=True))
    op.add_column('signals', sa.Column('meta_atr', sa.Float(), nullable=True))
    op.add_column('signals', sa.Column('regime_type', sa.String(length=20), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('signals', 'regime_type')
    op.drop_column('signals', 'meta_atr')
    op.drop_column('signals', 'meta_adx')
