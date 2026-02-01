"""populate_asset_type

Revision ID: 9c25f293de51
Revises: 9951482fd92a
Create Date: 2026-02-01 12:10:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import table, column

revision = '9c25f293de51'
down_revision = '9951482fd92a'
branch_labels = None
depends_on = None

def upgrade() -> None:
    signals = table('signals',
        column('symbol', sa.String),
        column('asset_type', sa.String)
    )
    
    # Crypto (termina com USDT ou BUSD)
    op.execute(
        signals.update()
        .where(
            sa.or_(
                signals.c.symbol.like('%USDT'),
                signals.c.symbol.like('%BUSD')
            )
        )
        .values(asset_type='CRYPTO')
    )
    
    # Forex (pares tradicionais)
    op.execute(
        signals.update()
        .where(
            sa.and_(
                ~signals.c.symbol.like('%USDT'),
                ~signals.c.symbol.like('%BUSD'),
                signals.c.symbol.like('%USD%') # Contém USD e não é crypto
            )
        )
        .values(asset_type='FOREX')
    )
    
    # Forex (pares sem USD ex EURJPY) - Simples fallback
    # Se não foi marcado como Crypto ou Forex acima, marca Unknown ou tenta match regex.
    # Vou simplificar: Se não é Crypto, é Forex/Outro
    op.execute(
        signals.update()
        .where(signals.c.asset_type.is_(None))
        .values(asset_type='UNKNOWN')
    )

def downgrade() -> None:
    signals = table('signals',
        column('asset_type', sa.String)
    )
    op.execute(
        signals.update().values(asset_type=None)
    )
