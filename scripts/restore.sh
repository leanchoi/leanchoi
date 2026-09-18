#!/usr/bin/env bash
# Restaura un backup sobre la base actual. DESTRUCTIVO: pisa los datos existentes.
#
#   CONFIRMAR=si bash scripts/restore.sh backups/relevamiento-20260918-120000.dump
#
# Sin CONFIRMAR=si no hace nada.
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

ARCHIVO="${1:-}"
if [[ -z "$ARCHIVO" ]]; then
  echo "Uso: CONFIRMAR=si bash scripts/restore.sh <archivo.dump>" >&2
  exit 2
fi
if [[ ! -f "$ARCHIVO" ]]; then
  echo "✖ No existe el archivo: $ARCHIVO" >&2
  exit 2
fi
if [[ "${CONFIRMAR:-}" != "si" ]]; then
  echo "✖ Restauración cancelada: repetí el comando con CONFIRMAR=si (esto PISA los datos actuales)." >&2
  exit 2
fi

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

echo "· Restaurando ${ARCHIVO}"
if command -v pg_restore >/dev/null 2>&1 && [[ -n "${DATABASE_URL:-}" ]]; then
  pg_restore --clean --if-exists --no-owner --no-privileges --dbname "$DATABASE_URL" "$ARCHIVO"
else
  : "${POSTGRES_USER:?Falta POSTGRES_USER}"
  : "${POSTGRES_DB:?Falta POSTGRES_DB}"
  docker compose exec -T db pg_restore \
    --clean --if-exists --no-owner --no-privileges \
    -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "$ARCHIVO"
fi

echo "✔ Restauración terminada. Verificá con: npm run healthcheck"
