import { describe, expect, it } from 'vitest';
import { firmarSesion, vencimiento, verificarSesion } from '@/lib/auth/sesion';
import type { PayloadSesion } from '@/lib/auth/sesion';

const SECRETO = 'x'.repeat(48);
const OTRO_SECRETO = 'y'.repeat(48);

function payload(exp = vencimiento(12)): PayloadSesion {
  return { uid: '018f0000-0000-7000-8000-000000000001', rol: 'encuestador', sid: 'abc', exp };
}

describe('la sesión viaja firmada', () => {
  it('se puede volver a leer lo que se firmó', () => {
    const token = firmarSesion(payload(), SECRETO);
    const leido = verificarSesion(token, SECRETO);
    expect(leido?.uid).toBe(payload().uid);
    expect(leido?.rol).toBe('encuestador');
  });

  it('un token tocado a mano no vale', () => {
    const token = firmarSesion(payload(), SECRETO);
    const [cuerpo, firma] = token.split('.') as [string, string];
    const falsificado = Buffer.from(
      JSON.stringify({ ...payload(), rol: 'admin' }),
      'utf8',
    ).toString('base64url');

    expect(verificarSesion(`${falsificado}.${firma}`, SECRETO)).toBeNull();
    expect(verificarSesion(`${cuerpo}.${firma.slice(0, -1)}a`, SECRETO)).toBeNull();
  });

  it('un token firmado con otro secreto no vale', () => {
    const token = firmarSesion(payload(), OTRO_SECRETO);
    expect(verificarSesion(token, SECRETO)).toBeNull();
  });

  it('una sesión vencida no vale', () => {
    const vencida = firmarSesion(payload(Math.floor(Date.now() / 1000) - 10), SECRETO);
    expect(verificarSesion(vencida, SECRETO)).toBeNull();
  });

  it('basura no rompe nada', () => {
    for (const basura of ['', 'nada', 'a.b.c', 'eyJ.x']) {
      expect(verificarSesion(basura, SECRETO)).toBeNull();
    }
    expect(verificarSesion(undefined, SECRETO)).toBeNull();
  });

  it('el vencimiento se calcula en horas', () => {
    const ahora = new Date('2026-09-19T10:00:00Z');
    expect(vencimiento(12, ahora)).toBe(Math.floor(ahora.getTime() / 1000) + 12 * 3600);
  });
});
