FROM node:20-alpine

# Módulos nativos (better-sqlite3) necesitan toolchain
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV DATA_DIR=/data

EXPOSE 4000

CMD ["sh", "entrypoint.sh"]
