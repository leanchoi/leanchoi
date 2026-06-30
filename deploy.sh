#!/bin/bash
set -e

REPO_URL="https://github.com/leanchoi/leanchoi.git"
APP_DIR="$HOME/leanboard"
APP_PORT=4000

echo "=============================="
echo "  LeanBoard - Deploy Script   "
echo "=============================="

# 1. Node.js
if ! command -v node &>/dev/null; then
  echo "[1/6] Instalando Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
else
  echo "[1/6] Node.js ya instalado: $(node -v)"
fi

# 2. PM2
if ! command -v pm2 &>/dev/null; then
  echo "[2/6] Instalando PM2..."
  sudo npm install -g pm2
else
  echo "[2/6] PM2 ya instalado"
fi

# 3. Clonar o actualizar repo
if [ -d "$APP_DIR" ]; then
  echo "[3/6] Actualizando código..."
  cd "$APP_DIR"
  git fetch origin
  git checkout claude/great-tesla-1i04uq
  git pull origin claude/great-tesla-1i04uq
else
  echo "[3/6] Clonando repositorio..."
  git clone -b claude/great-tesla-1i04uq "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

# 4. Configurar .env
if [ ! -f "$APP_DIR/.env" ]; then
  echo "[4/6] Configurando variables de entorno..."
  SECRET=$(openssl rand -base64 32)
  cat > "$APP_DIR/.env" <<EOF
NEXTAUTH_SECRET=$SECRET
NEXTAUTH_URL=http://localhost:$APP_PORT
EOF
  echo "      .env creado con secret aleatorio"
else
  echo "[4/6] .env ya existe, no se modifica"
fi

# 5. Instalar deps y buildear
echo "[5/6] Instalando dependencias y construyendo..."
cd "$APP_DIR"
npm install
npm run setup
npm run build

# 6. Iniciar/reiniciar con PM2
echo "[6/6] Iniciando aplicación..."
if pm2 describe leanboard &>/dev/null; then
  pm2 restart leanboard
else
  pm2 start npm --name leanboard -- start
fi
pm2 save

echo ""
echo "=============================="
echo "  Deploy completado!"
echo "  App corriendo en puerto $APP_PORT"
echo ""
echo "  Usuario admin inicial:"
echo "    Usuario:    admin"
echo "    Contraseña: admin123"
echo ""
echo "  IMPORTANTE: Cambia la contraseña"
echo "  del admin desde el panel (/admin)"
echo "=============================="
