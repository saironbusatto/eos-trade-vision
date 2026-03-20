# Infraestrutura EOS (AWS)

Guia operacional da stack ativa em produção.

## 1) Ambiente ativo

- Região: `sa-east-1` (São Paulo)
- EC2: `54.232.17.9`
- Runtime principal: `eos-telegram-bot` (Node.js + TypeScript + SQLite + ML Python)
- API agregadora: `eos-gateway`
- Frontend: build estático servido por Nginx

Importante:
- `IQ Option` está fora da stack ativa.
- Tudo legado foi movido para `obsolete/`.

## 2) Processo de deploy

Deploy é acionado por push na `main` via:

- `.github/workflows/deploy.yml`

Fluxo do hook:
1. faz `git pull` no servidor;
2. instala dependências do bot (`npm ci --omit=dev`);
3. sobe/reinicia PM2 `eos-bot`;
4. executa `scripts/deploy_post_cleanup.sh` se existir.

## 3) Diretórios de produção (padrão atual)

O workflow suporta dois layouts por compatibilidade:

- Novo: `/home/ec2-user/eos-telegram-bot/eos-telegram-bot`
- Legado: `/home/ec2-user/eos-bot`

Em ambos os casos, o bot deve estar com:
- código compilado em `dist/`
- banco em `data/eos.db`
- configuração em `.env`

## 4) Serviços e portas

- `80/tcp`: frontend/API via Nginx
- `22/tcp`: SSH
- PM2:
  - `eos-bot`: processo principal do bot

## 5) Banco e retenção

Banco principal:
- `eos-telegram-bot/data/eos.db`

Política operacional:
- histórico bruto permanece no SQLite;
- leitura de performance por fase é segmentada por `STATS_PHASE_TAG` (backend);
- baseline por fase em `app_settings` como `stats_baseline_at:<tag>`.

Fase padrão atual:
- `fase jim compound v1`

## 6) Variáveis críticas

Obrigatórias:
- `TELEGRAM_ENABLED=true`
- `TELEGRAM_BOT_TOKEN=...`
- `TELEGRAM_CHANNEL_ID=...`
- `API_SECRET=...`

Controle de fase:
- `STATS_PHASE_TAG="fase jim compound v1"`

Resiliência do engine:
- `ENGINE_TARGET_COVERAGE_SEC=3300`
- `ENGINE_MAX_LAG_MS=8000`
- `ENGINE_RECOVERY_LAG_MS=3000`

## 7) Checklist pós-deploy (AWS)

Executar no servidor:

```bash
pm2 status
pm2 logs eos-bot --lines 80 --nostream
curl -s http://localhost:3000/health
curl -s http://localhost:3000/api/stats
node -e "const Database=require('better-sqlite3'); const db=new Database('/home/ec2-user/eos-telegram-bot/data/eos.db'); console.log(db.prepare(\"SELECT key,value FROM app_settings WHERE key LIKE ? ORDER BY key\").all('stats_baseline_at:%'));"
```

O que validar:
1. `eos-bot` em `online`.
2. `/health` com `telegram.ok=true`.
3. `/api/stats` retornando counters da fase atual.
4. baseline da fase presente em `app_settings`.

## 8) Operação manual útil

```bash
# SSH
ssh -i sirontech_key.pem ec2-user@54.232.17.9

# Restart com env atualizado
pm2 restart eos-bot --update-env

# Health rápido
curl -s http://localhost:3000/health
```

## 9) Observabilidade mínima recomendada

- acompanhar log de erro PM2 diariamente;
- manter backup periódico de `data/eos.db`;
- revisar taxa de `DEGRADED` do engine após mudanças de infra ou rede.
