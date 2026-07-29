import bcrypt from 'bcryptjs';
import db from './db';

// ── Contraseñas por defecto ──────────────────────────────────────────────
//
// Los usuarios se crearon con una contraseña única para todos. Mientras sigan
// usándola, cualquiera que la conozca entra con la cuenta de cualquier
// compañero: no hay identidad real y la trazabilidad de "quién hizo qué" no
// vale nada.
//
// El hash de bcrypt no se puede revisar sin el texto plano, así que la
// comprobación se hace en el único momento donde lo tenemos: el login. El
// resultado se guarda en users.password_is_default para que el resto de la app
// (y el panel de admin) lo puedan leer sin la contraseña.

export const DEFAULT_PASSWORDS = ['123456789', '12345678', 'admin123', 'trochi123'];

/** ¿Es una de las contraseñas repartidas por defecto? */
export function isDefaultPassword(plain: string): boolean {
  return DEFAULT_PASSWORDS.includes(plain);
}

/**
 * Registra si el usuario sigue usando una contraseña por defecto.
 * Se llama en el login, que es cuando tenemos el texto plano.
 */
export function recordPasswordState(userId: number, plain: string): void {
  const isDefault = isDefaultPassword(plain) ? 1 : 0;
  try {
    db.prepare('UPDATE users SET password_is_default = ? WHERE id = ?').run(isDefault, userId);
  } catch {}
}

/** Marca la contraseña como propia (la cambió el usuario). */
export function markPasswordChanged(userId: number): void {
  db.prepare(
    "UPDATE users SET password_is_default = 0, password_changed_at = datetime('now') WHERE id = ?"
  ).run(userId);
}

/** ¿Este usuario tiene que cambiar la contraseña antes de seguir? */
export function mustChangePassword(userId: number): boolean {
  const row = db
    .prepare('SELECT password_is_default FROM users WHERE id = ?')
    .get(userId) as any;
  return !!row && row.password_is_default === 1;
}

/**
 * Valida una contraseña nueva. Devuelve el motivo del rechazo, o null si está
 * bien. Deliberadamente simple: pedir símbolos y mayúsculas empuja a la gente a
 * anotarla en un papel. Lo que importa es que no sea una de las repartidas.
 */
export function validateNewPassword(plain: string, username?: string): string | null {
  const p = String(plain || '');
  if (p.length < 8) return 'La contraseña nueva tiene que tener al menos 8 caracteres.';
  if (isDefaultPassword(p)) return 'Esa es una de las contraseñas por defecto. Elegí una que sólo sepas vos.';
  if (/^(\d)\1+$/.test(p)) return 'No uses un solo dígito repetido.';
  if (/^(0123456789|1234567890|123456789|987654321|abcdefgh)/.test(p))
    return 'Evitá secuencias como 123456789: son las primeras que se prueban.';
  if (username && p.toLowerCase().includes(String(username).toLowerCase()))
    return 'La contraseña no puede contener tu nombre de usuario.';
  return null;
}
