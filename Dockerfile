# Готовый образ для Railway, Fly.io, VPS и других хостингов с Docker
FROM node:20-alpine

ENV NODE_ENV=production \
    PORT=4321 \
    HOST=0.0.0.0 \
    DATA_DIR=/data

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

# папка с данными сайта: заявки, настройки, загруженные фото
RUN mkdir -p /data/uploads
VOLUME ["/data"]

EXPOSE 4321

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4321)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
