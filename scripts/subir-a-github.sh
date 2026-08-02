#!/usr/bin/env bash
# =============================================================================
#  Media Abrojal — subir el proyecto del VPS a GitHub + generar diagnóstico
# =============================================================================
#  Uso (en el VPS, por SSH):
#
#     export PROJECT_DIR=/ruta/a/red43_allsite     # <-- ajustá esta ruta
#     export GITHUB_USER=leanchoi
#     export GITHUB_TOKEN=ghp_xxxxxxxxxxxx         # PAT con scope 'repo'
#     bash subir-a-github.sh
#
#  Qué hace:
#   1. Protege secretos: escribe/refuerza .gitignore ANTES de hacer git add.
#   2. Avisa si detecta credenciales que igual quedarían trackeadas.
#   3. Genera docs/diagnostico/ con schema de la base, conteos por bucket,
#      estado del scraper y cron/systemd  -> esto es lo que necesito para
#      arreglar la indexación y revisar el scraper.
#   4. Commitea y pushea a github.com/$GITHUB_USER/media-abrojal (privado).
#
#  NO borra ni modifica nada de tu app. Solo lee y agrega git + docs.
# =============================================================================
set -uo pipefail

REPO_NAME="${REPO_NAME:-media-abrojal}"
BRANCH="${BRANCH:-main}"

c_ok()   { printf '\033[32m✓\033[0m %s\n' "$*"; }
c_warn() { printf '\033[33m!\033[0m %s\n' "$*"; }
c_err()  { printf '\033[31m✗\033[0m %s\n' "$*"; }
c_step() { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }

# ---------------------------------------------------------------- validaciones
[ -n "${PROJECT_DIR:-}" ]  || { c_err "Falta PROJECT_DIR. Ej: export PROJECT_DIR=/opt/red43_allsite"; exit 1; }
[ -d "$PROJECT_DIR" ]      || { c_err "No existe el directorio: $PROJECT_DIR"; exit 1; }
[ -n "${GITHUB_USER:-}" ]  || { c_err "Falta GITHUB_USER"; exit 1; }
[ -n "${GITHUB_TOKEN:-}" ] || { c_err "Falta GITHUB_TOKEN (PAT con scope 'repo')"; exit 1; }

cd "$PROJECT_DIR" || exit 1
c_ok "Proyecto: $PROJECT_DIR"

# ------------------------------------------------------------------ .gitignore
c_step "1/5  Protegiendo secretos"

touch .gitignore
add_ignore() { grep -qxF "$1" .gitignore 2>/dev/null || echo "$1" >> .gitignore; }

for p in \
  '.env' '.env.*' '!.env.example' '*.env' 'secrets.*' '*.pem' '*.key' 'id_rsa*' \
  '__pycache__/' '*.pyc' '.venv/' 'venv/' 'env/' '.Python' \
  'node_modules/' '.next/' 'dist/' 'build/' '.cache/' \
  '*.sqlite' '*.sqlite3' '*.db' 'db.sqlite3' \
  '*.log' 'logs/' '*.pid' \
  '.DS_Store' 'Thumbs.db' \
  'media/' 'uploads/' 'staticfiles/' \
  '*.dump' '*.sql.gz' 'backups/' \
  ; do add_ignore "$p"; done
c_ok ".gitignore reforzado ($(wc -l < .gitignore) reglas)"

# Guardar SOLO los nombres de variables de entorno (nunca los valores)
mkdir -p docs/diagnostico
if compgen -G ".env*" > /dev/null; then
  {
    echo "# Variables de entorno detectadas (solo nombres, sin valores)"
    echo
    for f in .env*; do
      [ -f "$f" ] || continue
      case "$f" in *.example) continue;; esac
      echo "## $f"
      grep -oE '^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*' "$f" 2>/dev/null | tr -d ' ' | sed 's/^/- /'
      echo
    done
  } > docs/diagnostico/env-keys.md
  c_ok "Nombres de variables guardados (valores NO)"
fi

# ------------------------------------------------------------- escaneo secretos
c_step "2/5  Escaneando credenciales que quedarían trackeadas"

SECRET_HITS=$(git -c core.quotepath=false grep -nIE \
  '(SECRET_KEY|PASSWORD|PASSWD|API_KEY|TOKEN|Bearer |postgres://|mysql://|mongodb\+srv://)[[:space:]]*[=:][[:space:]]*['\''"]?[A-Za-z0-9_\-\.\/\+]{8,}' \
  -- . 2>/dev/null | grep -vE '(\.example|\.md:|node_modules|\.lock|docs/diagnostico)' | head -25)

if [ -n "$SECRET_HITS" ]; then
  c_warn "Posibles credenciales hardcodeadas (revisalas antes de hacer público el repo):"
  echo "$SECRET_HITS" | sed 's/^/    /'
  c_warn "El repo se crea PRIVADO, así que no se exponen. Igual conviene moverlas a .env."
else
  c_ok "Sin credenciales hardcodeadas evidentes"
fi

# ------------------------------------------------------------------ diagnóstico
c_step "3/5  Generando diagnóstico (schema, buckets, scraper)"

DIAG=docs/diagnostico

# --- estructura del proyecto
{
  echo "# Estructura del proyecto"
  echo '```'
  if command -v tree >/dev/null 2>&1; then
    tree -a -L 3 -I '.git|node_modules|__pycache__|.venv|venv|.next' 2>/dev/null
  else
    find . -maxdepth 3 \( -name .git -o -name node_modules -o -name __pycache__ -o -name .venv -o -name venv \) -prune -o -print 2>/dev/null | head -300
  fi
  echo '```'
} > "$DIAG/estructura.md"

# --- servicios / procesos / scheduler  (clave para revisar el scraper continuo)
{
  echo "# Runtime: servicios, scheduler y contenedores"
  echo
  echo "## systemd (unidades del proyecto)"
  echo '```'
  systemctl list-units --type=service --all --no-pager 2>/dev/null | grep -iE 'red43|abrojal|scrap|celery|gunicorn|uvicorn|node' || echo "(sin unidades coincidentes)"
  echo
  systemctl list-timers --all --no-pager 2>/dev/null | head -25 || echo "(sin timers)"
  echo '```'
  echo
  echo "## cron"
  echo '```'
  crontab -l 2>/dev/null || echo "(sin crontab del usuario)"
  echo "--- /etc/cron.d ---"
  ls /etc/cron.d 2>/dev/null && grep -rhs . /etc/cron.d 2>/dev/null | grep -iE 'scrap|red43|abrojal|python|node' | head -20
  echo '```'
  echo
  echo "## docker"
  echo '```'
  docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null || echo "(docker no disponible)"
  echo '```'
  echo
  echo "## procesos activos"
  echo '```'
  ps aux 2>/dev/null | grep -iE 'scrap|celery|gunicorn|uvicorn|node|python' | grep -v grep | head -20
  echo '```'
} > "$DIAG/runtime.md"

# --- base de datos
DB_URL="$(grep -rhoE '^[[:space:]]*(DATABASE_URL|DB_URL|POSTGRES_URL)[[:space:]]*=[[:space:]]*.*' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'"'"' ' )"

{
  echo "# Base de datos"
  echo
  if [ -n "$DB_URL" ] && command -v psql >/dev/null 2>&1 && case "$DB_URL" in postgres*) true;; *) false;; esac; then
    echo "## Motor: PostgreSQL"
    echo
    echo "### Tablas y columnas"
    echo '```'
    psql "$DB_URL" -c "\dt" 2>&1 | head -60
    echo
    psql "$DB_URL" -Atc "
      SELECT table_name||' . '||column_name||'  ['||data_type||']'
      FROM information_schema.columns
      WHERE table_schema='public' ORDER BY table_name, ordinal_position;" 2>&1 | head -200
    echo '```'
    echo
    echo "### Conteo de filas por tabla"
    echo '```'
    psql "$DB_URL" -Atc "
      SELECT relname||' = '||n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC;" 2>&1 | head -40
    echo '```'
  else
    SQLITE_DB="$(find . -maxdepth 3 \( -name '*.sqlite3' -o -name '*.sqlite' -o -name '*.db' \) -not -path './node_modules/*' 2>/dev/null | head -1)"
    if [ -n "$SQLITE_DB" ] && command -v sqlite3 >/dev/null 2>&1; then
      echo "## Motor: SQLite  ($SQLITE_DB)"
      echo
      echo "### Schema"
      echo '```sql'
      sqlite3 "$SQLITE_DB" ".schema" 2>&1 | head -250
      echo '```'
      echo
      echo "### Conteo de filas por tabla"
      echo '```'
      for t in $(sqlite3 "$SQLITE_DB" "SELECT name FROM sqlite_master WHERE type='table';" 2>/dev/null); do
        printf '%s = %s\n' "$t" "$(sqlite3 "$SQLITE_DB" "SELECT COUNT(*) FROM \"$t\";" 2>/dev/null)"
      done
      echo '```'
      echo "$SQLITE_DB" > "$DIAG/.dbpath"
    else
      echo "_No se detectó automáticamente la base. Pegá acá el schema a mano._"
      echo
      echo "Pistas encontradas:"
      echo '```'
      grep -rhoE '(DATABASE_URL|DB_ENGINE|DB_NAME|sqlite|postgres|mysql)[^[:space:]]{0,60}' \
        --include='*.py' --include='*.js' --include='*.ts' --include='*.yml' --include='*.yaml' . 2>/dev/null \
        | grep -v node_modules | sort -u | head -20
      echo '```'
    fi
  fi
} > "$DIAG/base-de-datos.md"

# --- distribución por bucket/categoría  (el problema que reportaste)
{
  echo "# Distribución de notas por bucket / categoría"
  echo
  echo "Esto es para diagnosticar por qué las notas caen en el bucket equivocado."
  echo
  DBP="$(cat "$DIAG/.dbpath" 2>/dev/null)"
  if [ -n "$DBP" ] && command -v sqlite3 >/dev/null 2>&1; then
    NOTE_TBL="$(sqlite3 "$DBP" "SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%nota%' OR name LIKE '%note%' OR name LIKE '%article%' OR name LIKE '%post%');" 2>/dev/null | head -1)"
    if [ -n "$NOTE_TBL" ]; then
      echo "Tabla de notas detectada: \`$NOTE_TBL\`"
      echo
      COLS="$(sqlite3 "$DBP" "PRAGMA table_info('$NOTE_TBL');" 2>/dev/null | cut -d'|' -f2 | tr '\n' ' ')"
      echo "Columnas: $COLS"
      echo
      for CAT in bucket categoria category tipologia tipo tag seccion; do
        if echo "$COLS" | grep -qw "$CAT"; then
          echo "## Conteo por \`$CAT\`"
          echo '```'
          sqlite3 -header -column "$DBP" "SELECT $CAT, COUNT(*) AS n FROM \"$NOTE_TBL\" GROUP BY $CAT ORDER BY n DESC LIMIT 40;" 2>&1
          echo '```'
          echo
          echo "## Muestra de 25 títulos por cada valor de \`$CAT\` (para ver los errores)"
          echo '```'
          sqlite3 "$DBP" "SELECT $CAT || ' :: ' || COALESCE(titulo, title, '') FROM \"$NOTE_TBL\" ORDER BY RANDOM() LIMIT 60;" 2>&1 | head -60
          echo '```'
        fi
      done
      echo "## Rango de fechas cubierto (hasta dónde captura el scraper)"
      echo '```'
      for D in fecha date published_at fecha_publicacion created_at scraped_at; do
        if echo "$COLS" | grep -qw "$D"; then
          sqlite3 "$DBP" "SELECT '$D: min=' || MIN($D) || '  max=' || MAX($D) || '  total=' || COUNT(*) FROM \"$NOTE_TBL\";" 2>&1
        fi
      done
      echo '```'
    else
      echo "_No se detectó la tabla de notas automáticamente._"
    fi
  else
    echo "_Base no accesible desde el script. Si es PostgreSQL, corré a mano:_"
    echo '```sql'
    echo "SELECT bucket, COUNT(*) FROM notas GROUP BY bucket ORDER BY 2 DESC;"
    echo "SELECT MIN(fecha), MAX(fecha), COUNT(*) FROM notas;"
    echo '```'
  fi
} > "$DIAG/distribucion-buckets.md"

# --- logs del scraper
{
  echo "# Logs del scraper (últimas líneas)"
  echo '```'
  find . /var/log -maxdepth 3 -name '*.log' 2>/dev/null | grep -iE 'scrap|red43|abrojal|celery|worker' | head -5 | while read -r L; do
    echo "=== $L ==="; tail -60 "$L" 2>/dev/null; echo
  done
  journalctl -u '*scrap*' -n 60 --no-pager 2>/dev/null | tail -60
  echo '```'
} > "$DIAG/scraper-logs.md"

rm -f "$DIAG/.dbpath"
c_ok "Diagnóstico generado en docs/diagnostico/"

# ------------------------------------------------------------------------- git
c_step "4/5  Preparando repositorio git"

if [ ! -d .git ]; then
  git init -q -b "$BRANCH"
  c_ok "git init"
else
  git symbolic-ref -q HEAD >/dev/null 2>&1 || git checkout -q -b "$BRANCH"
  c_ok "repo git ya existente"
fi

git config user.email "${GIT_EMAIL:-leandro.choi@gmail.com}"
git config user.name  "${GIT_NAME:-Leandro Choi}"

# Sacar del índice cualquier secreto que ya estuviera trackeado
git rm -r --cached --ignore-unmatch -q .env .env.* venv .venv node_modules 2>/dev/null

git add -A
if git diff --cached --quiet 2>/dev/null; then
  c_warn "No hay cambios para commitear"
else
  git commit -q -m "Snapshot del proyecto desde el VPS + diagnóstico de indexación y scraper"
  c_ok "commit creado"
fi

# ------------------------------------------------------------------------ push
c_step "5/5  Creando repo en GitHub y pusheando"

HTTP=$(curl -s -o /tmp/gh_create.json -w '%{http_code}' \
  -X POST https://api.github.com/user/repos \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -d "{\"name\":\"$REPO_NAME\",\"private\":true,\"description\":\"Media Abrojal — indexación, clasificación y análisis de impacto de notas\"}")

case "$HTTP" in
  201) c_ok "Repo creado: $GITHUB_USER/$REPO_NAME (privado)" ;;
  422) c_ok "El repo ya existía, sigo" ;;
  401|403) c_err "Token rechazado (HTTP $HTTP). Necesitás un PAT con scope 'repo'."; cat /tmp/gh_create.json; exit 1 ;;
  *)   c_warn "Respuesta inesperada al crear el repo (HTTP $HTTP):"; cat /tmp/gh_create.json ;;
esac

git remote remove origin 2>/dev/null
git remote add origin "https://${GITHUB_USER}:${GITHUB_TOKEN}@github.com/${GITHUB_USER}/${REPO_NAME}.git"

if git push -u origin "$BRANCH" 2>&1 | tail -5; then
  # No dejar el token guardado en .git/config
  git remote set-url origin "https://github.com/${GITHUB_USER}/${REPO_NAME}.git"
  c_ok "Push completo -> https://github.com/${GITHUB_USER}/${REPO_NAME}"
  echo
  c_ok "Listo. Avisame y sigo desde el código real."
else
  git remote set-url origin "https://github.com/${GITHUB_USER}/${REPO_NAME}.git"
  c_err "Falló el push. Revisá el token y volvé a correr el script."
  exit 1
fi
