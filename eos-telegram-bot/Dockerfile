FROM node:20-slim

WORKDIR /app

# Dependências de runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copiar package.json e instalar dependências
COPY package*.json ./
RUN npm ci --only=production

# Copiar código compilado
COPY dist/ ./dist/

# Dados serão montados via volume

# Variáveis de ambiente
ENV NODE_ENV=production

# Executar
CMD ["node", "dist/index.js"]
