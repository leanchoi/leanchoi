# Imagen base Debian slim (NO alpine): Prisma necesita OpenSSL del sistema y
# en alpine/musl la deteccion del motor falla. Debian es el camino soportado.

# ── deps ─────────────────────────────────────────────────────────────────────
FROM node:22-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm install --no-audit --no-fund

# ── build ────────────────────────────────────────────────────────────────────
FROM node:22-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# DATABASE_URL dummy: el build no toca la base, solo genera el cliente
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN npx prisma generate && npm run build \
    # seed precompilado a JS plano (evita depender de tsx/esbuild en runtime)
    && node_modules/.bin/esbuild prisma/seed.ts --bundle --platform=node \
       --target=node22 --external:@prisma/client --outfile=prisma/seed.cjs

# ── runtime ──────────────────────────────────────────────────────────────────
FROM node:22-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
# CLI de prisma completo (db push) + cliente generado con sus engines
COPY --from=build /app/node_modules/prisma ./node_modules/prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3000
CMD ["./docker-entrypoint.sh"]
