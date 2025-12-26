# EOS Telegram Bot Backend

Backend para enviar sinais de trading para o canal Telegram.

## Setup Local

```bash
npm install
cp .env.example .env
# Edite .env com suas credenciais
npm run dev
```

## Deploy Railway

1. Crie projeto no [Railway](https://railway.app)
2. Conecte ao repositório GitHub
3. Configure as variáveis de ambiente:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHANNEL_ID`
   - `API_SECRET`

## Endpoints

### `GET /health`
Health check

### `POST /api/signal`
```json
{
  "symbol": "BTCUSDT",
  "action": "BUY",
  "price": 98000.50,
  "stopLoss": 97000,
  "takeProfit": 100000
}
```

### `POST /api/alert`
```json
{
  "message": "Texto do alerta",
  "type": "info"
}
```

**Auth:** `Authorization: Bearer YOUR_API_SECRET`
