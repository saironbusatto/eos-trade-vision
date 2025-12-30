# Infraestrutura EOS - AWS EC2

## Servidor

- **IP:** 54.232.17.9
- **Tipo:** t2.micro (1 CPU, 1GB RAM)
- **OS:** Amazon Linux 2023
- **Região:** sa-east-1 (São Paulo)

## Portas Abertas (Security Group)

| Porta | Protocolo | Uso |
|-------|-----------|-----|
| 22 | TCP | SSH |
| 80 | TCP | HTTP (redirect to HTTPS) |
| 443 | TCP | HTTPS |
| 3000 | TCP | API Backend |

## Serviços Rodando

### Nginx
- Serve frontend em `/var/www/eos/`
- Proxy reverso para API em `localhost:3000`
- SSL via Let's Encrypt

```
/etc/nginx/conf.d/eos.conf
```

### PM2 - Process Manager

| ID | Nome | Diretório | Porta |
|----|------|-----------|-------|
| 0 | eos-bot | /home/ec2-user/eos-bot | 3000 |
| 1 | eos-iq | /home/ec2-user/eos-iq-bot | - |

## Estrutura de Arquivos EC2

```
/home/ec2-user/
├── eos-bot/              # EOS Crypto Bot
│   ├── dist/
│   ├── node_modules/
│   ├── package.json
│   └── .env
│
└── eos-iq-bot/           # EOS IQ Bot
    ├── dist/
    ├── node_modules/
    ├── package.json
    └── .env

/var/www/eos/             # Frontend
├── index.html
├── assets/
└── ...
```

## SSL/HTTPS

- **Provedor:** Let's Encrypt
- **Renovação:** Automática via Certbot

```bash
# Verificar certificado
sudo certbot certificates

# Renovar manualmente
sudo certbot renew
```

## DNS

- **Domínio:** eos.s-iron.tech
- **Tipo:** A Record
- **Valor:** 54.232.17.9
- **Provedor:** Locaweb

## Comandos Úteis

```bash
# Conectar ao servidor
ssh -i sirontech_key.pem ec2-user@54.232.17.9

# Ver uso de memória
free -h

# Ver uso de disco
df -h

# Ver processos PM2
pm2 status
pm2 monit

# Ver logs Nginx
sudo tail -f /var/log/nginx/error.log

# Reiniciar Nginx
sudo systemctl reload nginx

# Backup PM2 config
pm2 save
```

## Troubleshooting

### Bot não responde
```bash
pm2 logs eos-bot --lines 50
pm2 restart eos-bot
```

### Site não carrega
```bash
sudo nginx -t
sudo systemctl status nginx
curl localhost/health
```

### SSL expirado
```bash
sudo certbot renew
sudo systemctl reload nginx
```

## Backup

### Salvar configuração PM2
```bash
pm2 save
```

### Exportar .env (fazer localmente)
```bash
scp ec2-user@54.232.17.9:/home/ec2-user/eos-bot/.env ./backup/eos-bot.env
scp ec2-user@54.232.17.9:/home/ec2-user/eos-iq-bot/.env ./backup/eos-iq.env
```

---

*Última atualização: 28/12/2025*
