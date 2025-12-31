# Infraestrutura EOS - AWS EC2

## Servidor

- **IP:** 54.232.17.9
- **Tipo:** t2.micro (1 CPU, 1GB RAM)
- **OS:** Amazon Linux 2023
- **Região:** sa-east-1 (São Paulo)

## Portas Abertas

| Porta | Uso |
|-------|-----|
| 22 | SSH |
| 80 | HTTP (redirect HTTPS) |
| 443 | HTTPS |
| 3000 | API Backend |

## Processos PM2

| ID | Nome | Diretório | Descrição |
|----|------|-----------|-----------|
| 1 | eos-bot | /home/ec2-user/eos-bot | EoS CRYPTO Bot |
| 2 | eos-iq | /home/ec2-user/eos-iq-bot | EoS IQ Bot |

## Estrutura de Arquivos

```
/home/ec2-user/
├── eos-bot/                    # EoS CRYPTO Bot
│   ├── dist/                   # Código compilado
│   ├── data/
│   │   └── eos.db              # SQLite database
│   ├── node_modules/
│   ├── package.json
│   └── .env
│
└── eos-iq-bot/                 # EoS IQ Bot
    ├── dist/
    ├── data/
    │   └── eos-iq.db           # SQLite database
    ├── node_modules/
    ├── package.json
    └── .env

/var/www/eos/                   # Frontend
├── index.html
└── assets/
```

## Databases

| Bot | Arquivo | Conteúdo |
|-----|---------|----------|
| EoS CRYPTO | eos.db | signals, ml_training, price_checkpoints |
| EoS IQ | eos-iq.db | signals |

## Comandos Úteis

```bash
# Conectar
ssh -i sirontech_key.pem ec2-user@54.232.17.9

# Status dos bots
pm2 status

# Logs em tempo real
pm2 logs eos-bot --lines 50
pm2 logs eos-iq --lines 50

# Reiniciar bots
pm2 restart eos-bot eos-iq

# Ver erros
cat /home/ec2-user/.pm2/logs/eos-bot-error.log

# Backup database
scp -i sirontech_key.pem ec2-user@54.232.17.9:/home/ec2-user/eos-bot/data/eos.db ./backup/
```

## Deploy

```bash
# EoS CRYPTO
cd eos-telegram-bot && npm run build
scp -i sirontech_key.pem -r dist/* ec2-user@54.232.17.9:/home/ec2-user/eos-bot/dist/
ssh -i sirontech_key.pem ec2-user@54.232.17.9 "pm2 restart eos-bot"

# EoS IQ
cd eos-iq-bot && npm run build
scp -i sirontech_key.pem -r dist/* ec2-user@54.232.17.9:/home/ec2-user/eos-iq-bot/dist/
ssh -i sirontech_key.pem ec2-user@54.232.17.9 "pm2 restart eos-iq"
```

## SSL/HTTPS

- **Provedor:** Let's Encrypt
- **Renovação:** Automática via Certbot

```bash
sudo certbot certificates
sudo certbot renew
```

## DNS

- **Domínio:** eos.s-iron.tech
- **Tipo:** A Record
- **Valor:** 54.232.17.9

---

*Última atualização: 31/12/2024*
