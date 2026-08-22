#!/usr/bin/env bash
#
# Arma `hostinger-deploy.zip`: todo lo que va en `public_html`, listo para
# descomprimir desde el Administrador de archivos de Hostinger.
#
#   ./tools/deploy/package-hostinger.sh
#   ./tools/deploy/package-hostinger.sh --skip-build     (usa el dist que ya está)
#
# Lo que arma:
#
#   public_html/
#     index.html            ← la SPA (juego y /admin)
#     assets/               ← bundle con hash: JS, CSS y mapas
#     prefabs/              ← fachadas voxelizadas de los edificios reales
#     .htaccess             ← enrutamiento SPA, /api, GZIP, caché y seguridad
#     api/                  ← los endpoints PHP
#     src/                  ← clases PHP (autoload PSR-4, sin Composer)
#     config/               ← database.php y el ejemplo de configuración
#     database/             ← schema.sql, migraciones y seeds para phpMyAdmin
#
# Lo que NO va, a propósito: `config/local.php` (credenciales), los `.map` de
# producción si se pide `--no-maps`, y cualquier `.env`.

set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SALIDA="$RAIZ/dist-deploy"
STAGE="$SALIDA/public_html"
ZIP="$RAIZ/hostinger-deploy.zip"

CONSTRUIR=1
CON_MAPAS=1
for arg in "$@"; do
  case "$arg" in
    --skip-build) CONSTRUIR=0 ;;
    --no-maps) CON_MAPAS=0 ;;
    -h|--help) sed -n '2,28p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Opción desconocida: $arg" >&2; exit 2 ;;
  esac
done

echo "→ Esquel 2027 · empaquetado para Hostinger"
echo "  raíz: $RAIZ"

# --- 1. Compilar ------------------------------------------------------------
if [ "$CONSTRUIR" -eq 1 ]; then
  echo "→ Verificando tipos en los cuatro paquetes…"
  (cd "$RAIZ" && npm run typecheck)

  echo "→ Compilando el cliente en modo producción…"
  (cd "$RAIZ" && npm run build --workspace client)
else
  echo "→ Salteando la compilación (--skip-build)"
fi

if [ ! -f "$RAIZ/client/dist/index.html" ]; then
  echo "✗ No hay build del cliente en client/dist. Corré sin --skip-build." >&2
  exit 1
fi

# --- 2. Armar el árbol ------------------------------------------------------
echo "→ Armando el árbol de public_html…"
rm -rf "$SALIDA"
mkdir -p "$STAGE"

cp -r "$RAIZ/client/dist/." "$STAGE/"

if [ "$CON_MAPAS" -eq 0 ]; then
  echo "  · sacando los source maps"
  find "$STAGE/assets" -name '*.map' -delete 2>/dev/null || true
fi

# Las fachadas voxelizadas viven en public/ y Vite ya las copió; si no, se copian.
if [ -d "$RAIZ/client/public/prefabs" ] && [ ! -d "$STAGE/prefabs" ]; then
  mkdir -p "$STAGE/prefabs"
  cp -r "$RAIZ/client/public/prefabs/." "$STAGE/prefabs/"
fi

cp "$RAIZ/backend-php/.htaccess" "$STAGE/.htaccess"
mkdir -p "$STAGE/api" "$STAGE/src" "$STAGE/config" "$STAGE/database"
cp -r "$RAIZ/backend-php/api/." "$STAGE/api/"
cp -r "$RAIZ/backend-php/src/." "$STAGE/src/"
cp "$RAIZ/backend-php/config/database.php" "$STAGE/config/database.php"
cp "$RAIZ/backend-php/config/config.example.php" "$STAGE/config/config.example.php"
cp -r "$RAIZ/backend-php/database/." "$STAGE/database/"

# Nunca se empaquetan credenciales, pase lo que pase.
rm -f "$STAGE/config/local.php"
find "$STAGE" -name '.env*' -delete 2>/dev/null || true
find "$STAGE" -name '*.log' -delete 2>/dev/null || true

# --- 3. Verificar lo que no puede faltar -------------------------------------
echo "→ Verificando el contenido…"
FALTA=0
for requerido in "index.html" ".htaccess" "assets" "api/auth/login.php" \
                 "api/intelligence/ingest.php" "api/intelligence/metrics.php" \
                 "api/sync/flush-stats.php" "src/Db.php" "config/database.php" \
                 "database/schema.sql"; do
  if [ ! -e "$STAGE/$requerido" ]; then
    echo "  ✗ falta $requerido" >&2
    FALTA=1
  fi
done

if [ -f "$STAGE/config/local.php" ]; then
  echo "  ✗ config/local.php quedó adentro del paquete: eso lleva credenciales." >&2
  FALTA=1
fi

if [ "$FALTA" -eq 1 ]; then
  echo "✗ El paquete está incompleto." >&2
  exit 1
fi

# --- 4. Comprimir ------------------------------------------------------------
echo "→ Comprimiendo…"
rm -f "$ZIP"
(cd "$STAGE" && zip -qr "$ZIP" . -x '*.DS_Store')

TAMANO=$(du -h "$ZIP" | cut -f1)
ARCHIVOS=$(unzip -l "$ZIP" | tail -1 | awk '{print $2}')

echo
echo "✓ $ZIP · $TAMANO · $ARCHIVOS archivos"
echo
echo "  Ahora, en Hostinger:"
echo "   1. hPanel → Bases de datos → crear la base y el usuario."
echo "   2. phpMyAdmin → importar database/schema.sql y después los seeds."
echo "   3. Administrador de archivos → subir el zip a public_html y extraer."
echo "   4. Copiar config/config.example.php a config/local.php y completarlo."
echo
echo "  El paso a paso completo está en docs/prompts/DEPLOY-GUIDE.md"
