import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Rol } from './roles';

/**
 * Sesión del personal municipal: un token firmado que viaja en una cookie
 * httpOnly. No hay proveedores externos ni tokens de terceros.
 *
 * El token dice quién sos y hasta cuándo; los permisos y el estado del usuario se
 * leen de la base en cada pedido, así que desactivar a alguien lo deja afuera al
 * instante, sin esperar a que venza nada.
 */

export type PayloadSesion = {
  /** Id del usuario. */
  uid: string;
  rol: Rol;
  /** Id de esta sesión, para poder rastrearla en la auditoría. */
  sid: string;
  /** Vencimiento, en segundos desde la época. */
  exp: number;
};

function base64url(dato: Buffer | string): string {
  return Buffer.from(dato).toString('base64url');
}

function firma(datos: string, secreto: string): string {
  return createHmac('sha256', secreto).update(datos).digest('base64url');
}

export function nuevoIdSesion(): string {
  return randomUUID();
}

export function firmarSesion(payload: PayloadSesion, secreto: string): string {
  const cuerpo = base64url(JSON.stringify(payload));
  return `${cuerpo}.${firma(cuerpo, secreto)}`;
}

/** Devuelve el payload solo si la firma es válida y la sesión no venció. */
export function verificarSesion(
  token: string | undefined | null,
  secreto: string,
  ahora = new Date(),
): PayloadSesion | null {
  if (!token) return null;

  const partes = token.split('.');
  if (partes.length !== 2) return null;
  const [cuerpo, recibida] = partes as [string, string];

  const esperada = firma(cuerpo, secreto);
  const a = Buffer.from(recibida);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: PayloadSesion;
  try {
    payload = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8')) as PayloadSesion;
  } catch {
    return null;
  }

  if (!payload?.uid || !payload?.rol || typeof payload.exp !== 'number') return null;
  if (payload.exp * 1000 <= ahora.getTime()) return null;

  return payload;
}

export function vencimiento(horas: number, ahora = new Date()): number {
  return Math.floor(ahora.getTime() / 1000) + horas * 3600;
}
