# =============================================================================
# Observatorio de Inteligencia Turística — imagen de despliegue
#
# Tres etapas: el ETL genera el dataset, Vite compila el tablero, y nginx sirve
# el resultado. La imagen final no lleva Python ni Node: son ~60 MB de estáticos.
# =============================================================================

# --- 1) Dataset --------------------------------------------------------------
FROM python:3.11-slim AS datos
WORKDIR /etl
COPY etl/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY etl/ .
# SHEET_ID vacío ⇒ usa el libro versionado en el repo (build reproducible).
ARG SHEET_ID=""
RUN if [ -n "$SHEET_ID" ]; then \
        python build.py --sheet-id "$SHEET_ID" --salida /salida ; \
    else \
        python build.py --salida /salida ; \
    fi

# --- 2) Tablero --------------------------------------------------------------
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package*.json ./
RUN npm ci --no-audit --no-fund
COPY web/ .
COPY --from=datos /salida ./public/data
RUN npm run build

# --- 3) Servidor -------------------------------------------------------------
FROM nginx:1.27-alpine AS runtime
RUN rm /etc/nginx/conf.d/default.conf
COPY deploy/nginx.conf /etc/nginx/conf.d/oit.conf
COPY --from=web /web/dist /usr/share/nginx/html

# Precomprimido: nginx sirve el .gz con gzip_static y no recomprime en cada request.
RUN find /usr/share/nginx/html -type f \
        \( -name '*.js' -o -name '*.css' -o -name '*.wasm' -o -name '*.arrow' \
           -o -name '*.json' -o -name '*.html' -o -name '*.svg' \) \
        -exec sh -c 'gzip -9 -k -f "$1"' _ {} \;

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
    CMD wget -qO- http://localhost:8080/health || exit 1
