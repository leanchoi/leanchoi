#!/usr/bin/env bash
# Preflight guardián para Métrica Aéreos
# Verifica que no haya procesos Chromium corriendo ni escasez crítica de RAM.

DEFER_FLAG="/tmp/metrica_aereos_preflight_defer"
rm -f "$DEFER_FLAG"

# 1. Verificar procesos Chromium activos
CHROMIUM_COUNT=$(pgrep -c -i chromium || true)
if [ "$CHROMIUM_COUNT" -gt 0 ]; then
    echo "[PREFLIGHT] Hay $CHROMIUM_COUNT procesos Chromium activos. Diferir corrida para no interferir con Métrica."
    touch "$DEFER_FLAG"
    exit 0
fi

# 2. Verificar memoria RAM libre disponible (mínimo 300 MB)
MEM_AVAIL_MB=$(free -m | awk '/^Mem:/{print $7}')
if [ "$MEM_AVAIL_MB" -lt 300 ]; then
    echo "[PREFLIGHT] Memoria disponible insuficiente: ${MEM_AVAIL_MB}MB (<300MB). Diferir corrida."
    touch "$DEFER_FLAG"
    exit 0
fi

echo "[PREFLIGHT] OK: Memoria disponible ${MEM_AVAIL_MB}MB, Chromium inactivo (0)."
exit 0
