#!/bin/sh
set -e

echo "→ Sincronizando esquema de base de datos"
node node_modules/prisma/build/index.js db push --skip-generate

if [ "${SEED_ON_BOOT:-0}" = "1" ]; then
  echo "→ Cargando datos demo (idempotente)"
  node prisma/seed.cjs || echo "seed omitido"
fi

echo "→ Iniciando app"
exec node server.js
