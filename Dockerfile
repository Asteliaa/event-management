# Backend: Node.js/Express + Socket.IO (ЛР8)
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# Сначала только package*.json: слой с зависимостями пересобирается,
# только когда они меняются, а не при каждой правке кода
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi \
    && npm cache clean --force

COPY . .

# Приложение работает не от root
USER node

EXPOSE 5000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -qO- http://127.0.0.1:${PORT:-5000}/health || exit 1

CMD ["node", "server.js"]
