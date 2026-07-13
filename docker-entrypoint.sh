#!/bin/sh
set -e

echo "→ Sincronizando esquema de base de datos"
./node_modules/.bin/prisma db push --skip-generate

if [ "${SEED_ON_BOOT:-0}" = "1" ]; then
  echo "→ Cargando datos demo (idempotente)"
  node ./node_modules/tsx/dist/cli.mjs prisma/seed.ts || echo "seed omitido"
fi

echo "→ Iniciando app"
exec node server.js
