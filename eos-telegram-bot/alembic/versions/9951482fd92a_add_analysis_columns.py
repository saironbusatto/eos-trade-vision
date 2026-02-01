"""add_analysis_columns

Revision ID: 9951482fd92a
Revises: 84d6f7236e77
Create Date: 2026-02-01 12:05:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '9951482fd92a'
down_revision = '84d6f7236e77'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Novas métricas de trading
    op.add_column('signals', sa.Column('pnl', sa.Float(), nullable=True))
    op.add_column('signals', sa.Column('mfe', sa.Float(), nullable=True))
    op.add_column('signals', sa.Column('mae', sa.Float(), nullable=True))
    op.add_column('signals', sa.Column('vwap', sa.Float(), nullable=True))
    op.add_column('signals', sa.Column('volume', sa.Float(), nullable=True))

    # Colunas para análise estatística avançada
    op.add_column('signals', sa.Column('location_va', sa.String(10), nullable=True))
    op.add_column('signals', sa.Column('distance_vwap_std', sa.Float(), nullable=True))
    op.add_column('signals', sa.Column('effort_result_ratio', sa.Float(), nullable=True))
    op.add_column('signals', sa.Column('is_absorption', sa.Boolean(), nullable=True))
    op.add_column('signals', sa.Column('volatility_regime', sa.String(10), nullable=True))
    op.add_column('signals', sa.Column('setup_type', sa.String(20), nullable=True))
    op.add_column('signals', sa.Column('asset_type', sa.String(10), nullable=True))
    
    # Índices para filtros rápidos
    op.create_index('idx_signals_asset_type', 'signals', ['asset_type'])
    op.create_index('idx_signals_location_va', 'signals', ['location_va'])

def downgrade() -> None:
    op.drop_index('idx_signals_location_va', table_name='signals')
    op.drop_index('idx_signals_asset_type', table_name='signals')
    
    op.drop_column('signals', 'asset_type')
    op.drop_column('signals', 'setup_type')
    op.drop_column('signals', 'volatility_regime')
    op.drop_column('signals', 'is_absorption')
    op.drop_column('signals', 'effort_result_ratio')
    op.drop_column('signals', 'distance_vwap_std')
    op.drop_column('signals', 'location_va')
    
    op.drop_column('signals', 'volume')
    op.drop_column('signals', 'vwap')
    op.drop_column('signals', 'mae')
    op.drop_column('signals', 'mfe')
    op.drop_column('signals', 'pnl')
