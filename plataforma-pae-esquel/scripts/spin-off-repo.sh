#!/usr/bin/env bash
# ============================================================
# Convierte esta carpeta en un repositorio Git independiente.
#
#   ./scripts/spin-off-repo.sh [destino] [--publico]
#
#   --publico   excluye interno/ (la estrategia política).
#               Usalo para la copia que se comparte con el municipio.
#
# No crea el repositorio en GitHub: imprime el comando exacto
# para hacerlo, porque crear repos requiere credenciales tuyas.
# ============================================================
set -euo pipefail

ORIGEN="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESTINO="${1:-$HOME/plataforma-pae-esquel}"
PUBLICO=false
for arg in "$@"; do [[ "$arg" == "--publico" ]] && PUBLICO=true; done
[[ "$DESTINO" == "--publico" ]] && DESTINO="$HOME/plataforma-pae-esquel"

if [[ -e "$DESTINO" ]]; then
  echo "✗ Ya existe: $DESTINO"
  echo "  Elegí otro destino o movelo antes de continuar."
  exit 1
fi

echo "→ Copiando de $ORIGEN a $DESTINO"
mkdir -p "$DESTINO"
tar -C "$ORIGEN" --exclude='.git' -cf - . | tar -C "$DESTINO" -xf -

if $PUBLICO; then
  rm -rf "$DESTINO/interno"
  echo "→ interno/ excluido (copia pública)"
  # quitar las referencias a interno/ del README para no dejar enlaces rotos
  sed -i.bak '/^interno\//d; /interno\//d' "$DESTINO/README.md" 2>/dev/null || true
  rm -f "$DESTINO/README.md.bak"
fi

cd "$DESTINO"
git init -q -b main
git add -A
git commit -q -m "Plataforma Trocha — gestión, trazabilidad e impacto del PAE (Esquel)

Informe de consultoría, arquitectura de producto, modelo de datos,
sistema visual validado, prototipo navegable y prompt de implementación."

echo ""
echo "✓ Repositorio creado en $DESTINO"
echo "  $(git rev-list --count HEAD) commit · $(git ls-files | wc -l | tr -d ' ') archivos"
echo ""
echo "Ahora, para publicarlo en GitHub:"
echo ""
echo "  gh repo create plataforma-pae-esquel --private --source=. --remote=origin --push"
echo ""
echo "o, sin gh: creá el repositorio vacío en github.com/new y después:"
echo ""
echo "  git remote add origin git@github.com:<usuario>/plataforma-pae-esquel.git"
echo "  git push -u origin main"
echo ""
if ! $PUBLICO; then
  echo "⚠ Esta copia INCLUYE interno/ (estrategia política)."
  echo "  Creala como repositorio PRIVADO, o volvé a correr el script con --publico."
fi
