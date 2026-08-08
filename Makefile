# =============================================================================
# Observatorio de Inteligencia Turística
#
#   make instalar   dependencias de Python y Node
#   make datos      regenera el dataset desde el libro local
#   make sheets     regenera el dataset desde el Google Sheet publicado
#   make dev        servidor de desarrollo con recarga en caliente
#   make build      compila el tablero para producción
#   make test       tests del ETL + chequeo de tipos del tablero
#   make docker     imagen lista para el VPS
#   make publicar   copia el sitio compilado a un servidor por rsync
# =============================================================================

SHELL := /bin/bash
.DEFAULT_GOAL := ayuda

PYTHON  ?= python3
SALIDA  ?= ../web/public/data
# ID del Google Sheet del Observatorio (se puede sobreescribir por entorno).
SHEET_ID ?= 1_NKQkMCwztlKijisKoypiUzBaWXHskReVN5SAc_kAvc
# Destino de `make publicar`, p. ej. usuario@vps:/var/www/turismo
DESTINO ?=

.PHONY: ayuda
ayuda:
	@grep -E '^#   make' $(MAKEFILE_LIST) | sed 's/^#   /  /'

# --- Dependencias ------------------------------------------------------------
.PHONY: instalar
instalar:
	cd etl && $(PYTHON) -m pip install -r requirements.txt
	cd web && npm ci --no-audit --no-fund

# --- Dataset -----------------------------------------------------------------
.PHONY: datos
datos:
	cd etl && $(PYTHON) build.py --salida $(SALIDA)

.PHONY: sheets
sheets:
	cd etl && $(PYTHON) build.py --sheet-id $(SHEET_ID) --salida $(SALIDA)

# --- Desarrollo --------------------------------------------------------------
.PHONY: dev
dev:
	cd web && npm run dev

.PHONY: build
build:
	cd web && npm run build

.PHONY: preview
preview: build
	cd web && npm run preview

# --- Calidad -----------------------------------------------------------------
.PHONY: test
test:
	cd etl && $(PYTHON) -m pytest tests/ -q
	cd web && npx tsc -b --noEmit

# --- Despliegue --------------------------------------------------------------
.PHONY: docker
docker:
	docker compose build

.PHONY: arriba
arriba:
	docker compose up -d

.PHONY: abajo
abajo:
	docker compose down

.PHONY: logs
logs:
	docker compose logs -f

# Precomprime para servidores que usan gzip_static (nginx del host, sin Docker).
.PHONY: comprimir
comprimir: build
	find web/dist -type f \
		\( -name '*.js' -o -name '*.css' -o -name '*.wasm' -o -name '*.arrow' \
		   -o -name '*.json' -o -name '*.html' -o -name '*.svg' \) \
		-exec gzip -9 -k -f {} \;
	@echo "Listo: web/dist con los .gz al lado de cada archivo."

.PHONY: publicar
publicar: comprimir
	@if [ -z "$(DESTINO)" ]; then \
		echo "Falta DESTINO. Ejemplo:"; \
		echo "  make publicar DESTINO=usuario@vps:/var/www/turismo"; \
		exit 1; \
	fi
	rsync -avz --delete web/dist/ $(DESTINO)/
	@echo "Publicado en $(DESTINO)"

# --- Actualización periódica -------------------------------------------------
# Pensado para un cron: baja la planilla, regenera el dataset y lo publica.
# El ETL aborta si el resultado se aleja de la serie oficial, así que un dato
# roto no llega a producción.
.PHONY: actualizar
actualizar: sheets build
	@if [ -n "$(DESTINO)" ]; then $(MAKE) publicar DESTINO=$(DESTINO); fi
	@echo "Dataset actualizado: $$(date '+%F %T')"

.PHONY: limpiar
limpiar:
	rm -rf web/dist web/public/data
	find . -name __pycache__ -type d -prune -exec rm -rf {} +
	find . -name .pytest_cache -type d -prune -exec rm -rf {} +
