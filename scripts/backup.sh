#!/usr/bin/env bash
# Backup completo de la base (los dos schemas: analitica e identificada).
#
#   bash scripts/backup.sh              # usa .env del directorio actual
#   BACKUP_DIR=/srv/backups bash scripts/backup.sh
#
# Genera un dump en formato custom de Postgres (restaurable con pg_restore).
# ATENCIÓN: el dump contiene datos personales. Guardalo cifrado y con acceso
# restringido (Ley 25.326).
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENCION_DIAS="${BACKUP_RETENCION_DIAS:-30}"
SELLO="$(date +%Y%m%d-%H%M%S)"
ARCHIVO="${BACKUP_DIR}/relevamiento-${SELLO}.dump"

mkdir -p "$BACKUP_DIR"

if command -v pg_dump >/dev/null 2>&1 && [[ -n "${DATABASE_URL:-}" ]]; then
  echo "· Usando pg_dump local contra DATABASE_URL"
  pg_dump --format=custom --no-owner --no-privileges --dbname "$DATABASE_URL" --file "$ARCHIVO"
else
  echo "· Usando pg_dump dentro del contenedor de Postgres (docker compose)"
  : "${POSTGRES_USER:?Falta POSTGRES_USER}"
  : "${POSTGRES_DB:?Falta POSTGRES_DB}"
  docker compose exec -T db pg_dump \
    --format=custom --no-owner --no-privileges \
    -U "$POSTGRES_USER" -d "$POSTGRES_DB" > "$ARCHIVO"
fi

chmod 600 "$ARCHIVO"
TAMANIO="$(du -h "$ARCHIVO" | cut -f1)"
echo "✔ Backup listo: ${ARCHIVO} (${TAMANIO})"

if [[ "$RETENCION_DIAS" -gt 0 ]]; then
  find "$BACKUP_DIR" -name 'relevamiento-*.dump' -type f -mtime "+${RETENCION_DIAS}" -print -delete \
    | sed 's/^/· Purgado por retención: /' || true
fi
