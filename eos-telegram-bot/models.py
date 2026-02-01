from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, MetaData
from sqlalchemy.ext.declarative import declarative_base

metadata = MetaData()
Base = declarative_base(metadata=metadata)

class Signal(Base):
    __tablename__ = 'signals'

    # Colunas existentes em eos.db (Baseado em analysis_output.txt)
    id = Column(Integer, primary_key=True)
    symbol = Column(String)
    action = Column(String)
    entry_price = Column(Float)
    stop_loss = Column(Float)
    take_profit = Column(Float)
    score = Column(Float)
    result = Column(String)
    created_at = Column(DateTime)
    validated_at = Column(DateTime)
    exit_price = Column(Float)
    
    # Features (f_*)
    f_smart_money = Column(Float)
    f_price_context = Column(Float)
    f_imbalance = Column(Float)
    f_absorption = Column(Float)
    f_trend = Column(Float)
    f_momentum = Column(Float)
    f_volume = Column(Float)
    
    # Outros campos identificados
    volume_ratio = Column(Float)
    trend = Column(String)
    momentum = Column(Float)
    price_change_24h = Column(Float)
    strategy_version = Column(String)

    # Nota: Colunas novas de análise serão adicionadas via migração posterior
    # mfe, mae, vwap, etc.
