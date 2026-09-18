# syntax=docker/dockerfile:1
#
# Imagen multi-stage del Relevamiento Barrial de Esquel.
#
#   docker build -t relevamiento-esquel .
#
# El puerto NO está fijado en la imagen: el proceso lee la variable PORT en
# tiempo de ejecución (ver docker-compose.yml y HANDOFF.md).

ARG NODE_VERSION=22-alpine

# ---------------------------------------------------------------- base
FROM node:${NODE_VERSION} AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
# tzdata: la app opera en horario de Argentina.
RUN apk add --no-cache tzdata

# ---------------------------------------------------------------- deps
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---------------------------------------------------------------- builder
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---------------------------------------------------------------- tools
# Stage con el código fuente y todas las dependencias: sirve para correr
# migraciones, seed y tareas de mantenimiento (docker compose run --rm tools ...).
FROM base AS tools
ENV NODE_ENV=development
RUN apk add --no-cache postgresql16-client bash
COPY --from=deps /app/node_modules ./node_modules
COPY . .
CMD ["npm", "run", "db:migrate"]

# ---------------------------------------------------------------- runner
FROM base AS runner
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0
RUN addgroup -g 1001 -S nodejs && adduser -S -u 1001 -G nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

# El puerto efectivo lo define PORT en el entorno; no se expone un número fijo.
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "const p=process.env.PORT||3000;fetch('http://127.0.0.1:'+p+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
