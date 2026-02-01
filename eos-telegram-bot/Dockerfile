FROM node:20-alpine

WORKDIR /app

# Dependências básicas
RUN apk add --no-cache ca-certificates

# ML Dependencies skipped (Server Disk Full - Upgrade Required)
# RUN pip install ...

# Copiar package.json e instalar dependências
COPY package*.json ./
RUN npm ci --only=production

# Copiar código compilado
COPY dist/ ./dist/
COPY ml/ ./ml/

# Dados serão montados via volume

# Variáveis de ambiente
ENV NODE_ENV=production

# Executar
CMD ["node", "dist/index.js"]
