FROM node:20-slim

WORKDIR /app

# System dependencies (Node + Python runtime for ML inference)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Copiar package.json e instalar dependências
COPY package*.json ./
RUN npm ci --omit=dev

# Install Python ML dependencies
COPY ml/requirements.txt ./ml/requirements.txt
RUN pip3 install --break-system-packages --no-cache-dir -r ./ml/requirements.txt

# Copiar código compilado
COPY dist/ ./dist/
COPY scripts/ ./scripts/
COPY ml/ ./ml/

# Dados serão montados via volume

# Variáveis de ambiente
ENV NODE_ENV=production

# Executar
CMD ["node", "dist/index.js"]
