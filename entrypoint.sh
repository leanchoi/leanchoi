#!/bin/sh
set -e

node scripts/setup-db.js

# -H fuerza a escuchar en 0.0.0.0 (nunca localhost) para que el mapeo
# de puertos de Docker funcione desde fuera del contenedor
exec node_modules/.bin/next start -p 4000 -H "${HOST:-0.0.0.0}"
