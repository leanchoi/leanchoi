/**
 * Verificación de JWT HS256 emitidos por Hostinger.
 *
 * Implementado con `node:crypto` a propósito: el mismo algoritmo, la misma
 * codificación base64url y las mismas comprobaciones que hace `backend-php/src/Jwt.php`.
 * Sin librería en el medio, la paridad entre PHP y Node se puede probar de verdad
 * (`npm run test:jwt` mintea en PHP y verifica en Node).
 *
 * El VPS **no** consulta MySQL para autenticar: confía en los claims firmados.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { JwtScope, UserJWT } from '@esquel/shared';

export type JwtFailure =
  | 'FORMATO'
  | 'ALGORITMO'
  | 'FIRMA'
  | 'EXPIRADO'
  | 'TODAVIA_NO_VALIDO'
  | 'EMISOR'
  | 'AUDIENCIA'
  | 'CLAIMS';

export type JwtResult = { ok: true; claims: UserJWT } | { ok: false; reason: JwtFailure; detail: string };

export interface VerifyOptions {
  readonly secret: string;
  readonly issuer: string;
  readonly audience: string;
  /** Tolerancia de reloj en segundos. */
  readonly clockToleranceS: number;
  /** Instante de referencia en ms (para tests). */
  readonly now?: number;
}

const b64urlToBuffer = (input: string): Buffer =>
  Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

export const b64url = (input: Buffer | string): string =>
  (Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

/** Firma HMAC-SHA256 de `header.payload`, en base64url. */
export const signHs256 = (signingInput: string, secret: string): string =>
  b64url(createHmac('sha256', secret).update(signingInput).digest());

/** Emite un token. Se usa en desarrollo y en los tests; en producción firma PHP. */
export const issueToken = (claims: UserJWT, secret: string): string => {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify(claims));
  const signingInput = `${header}.${payload}`;
  return `${signingInput}.${signHs256(signingInput, secret)}`;
};

/**
 * Verifica firma, vigencia, emisor y audiencia, y comprueba que estén los claims
 * de juego que la sala necesita.
 */
export const verifyToken = (token: string, options: VerifyOptions): JwtResult => {
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'FORMATO', detail: 'El token no tiene tres segmentos.' };

  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

  let header: { alg?: string; typ?: string };
  let claims: UserJWT;
  try {
    header = JSON.parse(b64urlToBuffer(headerB64).toString('utf8')) as { alg?: string; typ?: string };
    claims = JSON.parse(b64urlToBuffer(payloadB64).toString('utf8')) as UserJWT;
  } catch {
    return { ok: false, reason: 'FORMATO', detail: 'Header o payload no son JSON válido.' };
  }

  if (header.alg !== 'HS256') {
    return { ok: false, reason: 'ALGORITMO', detail: `alg="${String(header.alg)}"; sólo se acepta HS256.` };
  }

  // Comparación en tiempo constante: la longitud se chequea antes para no tirar.
  const expected = Buffer.from(signHs256(`${headerB64}.${payloadB64}`, options.secret), 'utf8');
  const received = Buffer.from(signatureB64, 'utf8');
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return { ok: false, reason: 'FIRMA', detail: 'La firma no coincide con el secreto compartido.' };
  }

  const now = Math.floor((options.now ?? Date.now()) / 1000);
  const tolerance = options.clockToleranceS;

  if (typeof claims.exp !== 'number' || claims.exp + tolerance < now) {
    return { ok: false, reason: 'EXPIRADO', detail: `exp=${String(claims.exp)} vs ahora=${now}` };
  }
  if (typeof claims.nbf === 'number' && claims.nbf - tolerance > now) {
    return { ok: false, reason: 'TODAVIA_NO_VALIDO', detail: `nbf=${claims.nbf} vs ahora=${now}` };
  }
  if (claims.iss !== options.issuer) {
    return { ok: false, reason: 'EMISOR', detail: `iss="${String(claims.iss)}"` };
  }

  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud as unknown as string];
  if (!audiences.includes(options.audience as never)) {
    return { ok: false, reason: 'AUDIENCIA', detail: `aud=${JSON.stringify(claims.aud)}` };
  }

  if (!claims.userId || !claims.alias) {
    return { ok: false, reason: 'CLAIMS', detail: 'Faltan userId o alias en el payload.' };
  }

  return { ok: true, claims };
};

/** `true` si el token trae el ámbito pedido. */
export const hasScope = (claims: UserJWT, scope: JwtScope): boolean =>
  Array.isArray(claims.scopes) && claims.scopes.includes(scope);
