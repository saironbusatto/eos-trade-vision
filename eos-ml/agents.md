# EOS Machine Learning Agent (Training)

> [!TIP]
> **Hub Central:** Consulte [`../agents.md`](../agents.md) para visão sistêmica e contratos globais.

## 🆔 Identidade
- **Sou:** Laboratório de Ciência de Dados (Pipeline). Responsável por extração de dados (ETL), treinamento, validação e serialização de modelos.
- **Não sou:** Não faço inferência em tempo real para tomada de decisão (isso vive dentro do `eos-telegram-bot/src/mlService.ts`).

## 🔌 Interfaces
- **Pipeline Principal:** [`src/train_pipeline.py`](./src/train_pipeline.py)
  - Orquestra: Load Data → Engineer Features → Train → Evaluate → Save.
- **Treinamento Ensemble:** [`src/train_ensemble.py`](./src/train_ensemble.py)
  - Algoritmos: XGBoost, LightGBM, RandomForest.
- **API (Opcional):** [`src/api_server.py`](./src/api_server.py) (Servidor Flask para inferência remota/debug).

## 💾 Dados
- **Input:**
  - `data/*.csv`: Datasets históricos brutoe e processados.
  - `../eos-telegram-bot/data/eos.db`: Leitura direta de `training_data` para retreino.
- **Output:**
  - `models/*.pkl`: Modelos serializados (Scalers, Encoders, Classifiers).

## 📡 Sinais (Contrato)
- **Model Artifacts:** O contrato é o **formato do arquivo .pkl**.
  - Deve esperar input array com shape exato definido na feature engineering.
  - Deve retornar probabilidade ou classe (0/1).

## 🤝 Dependências (Vizinhos)
- **Crypto Bot:** [`../eos-telegram-bot/agents.md`](../eos-telegram-bot/agents.md) (Consumidor final dos `.pkl`).

## ☑️ Checklist / Compatibilidade
- [ ] **Breaking Change:** Se adicionar nova feature no treino, OBRIGATÓRIO atualizar `mlService.ts` no Bot para enviar essa feature na inferência.
- [ ] Versionamento: Manter `scikit-learn`, `xgboost` e `lightgbm` com versões pinadas no `requirements.txt` compatíveis com o ambiente do Bot.
