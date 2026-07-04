#!/bin/sh
set -e

echo "→ Corriendo seed de la base de datos…"
node scripts/seed.js

echo "→ Arrancando Arrayán Workflows en el puerto 4000…"
exec npm run start
