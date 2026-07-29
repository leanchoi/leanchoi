// ── Límite de intentos de login ──────────────────────────────────────────
//
// Hasta ahora se podían probar contraseñas sin ningún tope. Con un solo proceso
// y SQLite local, un contador en memoria alcanza: si el proceso se reinicia se
// pierde la cuenta, que es aceptable para el caso de uso (una instancia,
// pocos usuarios) y no agrega dependencias.

type Bucket = { count: number; firstAt: number; blockedUntil: number };

const buckets = new Map<string, Bucket>();

const WINDOW_MS = 15 * 60 * 1000; // ventana de conteo: 15 minutos
const MAX_ATTEMPTS = 8; // intentos fallidos permitidos por ventana
const BLOCK_MS = 15 * 60 * 1000; // bloqueo tras superar el tope

// Limpieza perezosa: sin esto el Map crece sin límite con cada usuario probado
function sweep(now: number) {
  if (buckets.size < 500) return;
  for (const [key, b] of Array.from(buckets.entries())) {
    if (now - b.firstAt > WINDOW_MS && now > b.blockedUntil) buckets.delete(key);
  }
}

/** ¿Está bloqueado? Devuelve los segundos que faltan, o 0 si puede intentar. */
export function loginBlockedFor(key: string): number {
  const b = buckets.get(key.toLowerCase());
  if (!b) return 0;
  const now = Date.now();
  if (now < b.blockedUntil) return Math.ceil((b.blockedUntil - now) / 1000);
  return 0;
}

/** Registra un intento fallido y bloquea si se pasó del tope. */
export function registerFailedLogin(key: string): void {
  const k = key.toLowerCase();
  const now = Date.now();
  sweep(now);
  const b = buckets.get(k);
  if (!b || now - b.firstAt > WINDOW_MS) {
    buckets.set(k, { count: 1, firstAt: now, blockedUntil: 0 });
    return;
  }
  b.count++;
  if (b.count >= MAX_ATTEMPTS) {
    b.blockedUntil = now + BLOCK_MS;
    b.count = 0;
    b.firstAt = now;
  }
}

/** Login exitoso: se borra el historial de ese usuario. */
export function clearLoginAttempts(key: string): void {
  buckets.delete(key.toLowerCase());
}
