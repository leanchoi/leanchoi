#!/usr/bin/env bash
# Arranque rapido en un VPS sin Docker (Debian/Ubuntu).
set -euo pipefail
cd "$(dirname "$0")"

python3 -m venv .venv
# shellcheck disable=SC1091
source .venv/bin/activate

pip install --upgrade pip
pip install -r requirements.txt

# Descarga el Chromium que corresponde a la version de playwright + libs del SO
playwright install --with-deps chromium

# Copia el ejemplo de configuracion si aun no existe
[ -f .env ] || cp .env.example .env

python -m app.cli initdb
echo ">> BD lista. Arranca el servidor con:  source .venv/bin/activate && python -m app.cli serve"
echo ">> O prueba el scrapeo directamente:   python -m app.cli scrape --query Madrid --platform booking"
