# ---------------------------------------------------------------------------
# Esquel 2027 — servidor autoritativo de juego
#
# Build multi-etapa: se compila con todo el monorepo a mano (necesita /shared) y
# la imagen final se queda sólo con el bundle y las dependencias de producción.
#
#   docker build -f server-vps/Dockerfile -t esquel/realtime .
#   docker run --env-file server-vps/.env -p 2567:2567 esquel/realtime
#
# El contexto de build es la RAÍZ del repo, no server-vps/.
# ---------------------------------------------------------------------------

FROM node:22-alpine AS build
WORKDIR /repo

# Primero los manifiestos: si no cambian, npm ci sale de la caché.
COPY package.json package-lock.json* ./
COPY shared/package.json shared/
COPY client/package.json client/
COPY server-vps/package.json server-vps/
COPY tools/ci/package.json tools/ci/
COPY tools/prefab-importer/package.json tools/prefab-importer/
COPY tools/telemetry-cli/package.json tools/telemetry-cli/
RUN npm install --workspaces --include-workspace-root --ignore-scripts --no-audit --no-fund

COPY tsconfig.base.json ./
COPY shared/ shared/
COPY server-vps/ server-vps/

RUN npm run build --workspace server-vps \
 && npm run typecheck --workspace server-vps

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Usuario sin privilegios: el servidor de juego no necesita ser root.
RUN addgroup -S esquel && adduser -S esquel -G esquel

COPY --from=build /repo/server-vps/dist ./dist
COPY --from=build /repo/server-vps/package.json ./package.json
COPY --from=build /repo/node_modules ./node_modules

USER esquel
EXPOSE 2567

# La sonda usa el mismo endpoint que PM2 y el uptime robot.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||2567)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
