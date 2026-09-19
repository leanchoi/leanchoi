import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getEnv } from '@/lib/env';
import type { Permiso, Rol } from './roles';
import { puede } from './roles';
import { firmarSesion, nuevoIdSesion, vencimiento, verificarSesion } from './sesion';
import { registrarAcceso, usuarioActivo } from './usuarios';
import type { UsuarioSesion } from './usuarios';

/**
 * Puertas de entrada del sistema. Todo lo que no sea la ruta pública del
 * cuestionario o la consulta del vecino pasa por acá.
 */

export class NoAutorizado extends Error {
  constructor(mensaje = 'Hay que iniciar sesión.') {
    super(mensaje);
    this.name = 'NoAutorizado';
  }
}

export class Prohibido extends Error {
  constructor(mensaje = 'Tu rol no tiene permiso para esto.') {
    super(mensaje);
    this.name = 'Prohibido';
  }
}

/** La sesión de quien está pidiendo, o null. */
export async function sesionActual(): Promise<UsuarioSesion | null> {
  const env = getEnv();
  const token = (await cookies()).get(env.SESSION_COOKIE_NAME)?.value;
  const payload = verificarSesion(token, env.SESSION_SECRET);
  if (!payload) return null;
  // El estado del usuario se relee siempre: desactivarlo lo saca al instante.
  return usuarioActivo(payload.uid);
}

export async function exigirSesion(): Promise<UsuarioSesion> {
  const sesion = await sesionActual();
  if (!sesion) throw new NoAutorizado();
  return sesion;
}

export async function exigirPermiso(permiso: Permiso): Promise<UsuarioSesion> {
  const sesion = await exigirSesion();
  if (!puede(sesion.rol, permiso)) throw new Prohibido();
  return sesion;
}

export async function exigirRol(roles: Rol[]): Promise<UsuarioSesion> {
  const sesion = await exigirSesion();
  if (!roles.includes(sesion.rol)) throw new Prohibido();
  return sesion;
}

/** Traduce los errores de las guardias a respuestas HTTP. */
export function respuestaDeError(error: unknown): NextResponse | null {
  if (error instanceof NoAutorizado) {
    return NextResponse.json({ error: 'no_autorizado', detalle: error.message }, { status: 401 });
  }
  if (error instanceof Prohibido) {
    return NextResponse.json({ error: 'prohibido', detalle: error.message }, { status: 403 });
  }
  return null;
}

export async function abrirSesion(usuario: UsuarioSesion): Promise<void> {
  const env = getEnv();
  const token = firmarSesion(
    {
      uid: usuario.id,
      rol: usuario.rol,
      sid: nuevoIdSesion(),
      exp: vencimiento(env.SESSION_TTL_HORAS),
    },
    env.SESSION_SECRET,
  );

  (await cookies()).set(env.SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.SESSION_COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
    maxAge: env.SESSION_TTL_HORAS * 3600,
  });

  await registrarAcceso(usuario.id);
}

export async function cerrarSesion(): Promise<void> {
  const env = getEnv();
  (await cookies()).delete(env.SESSION_COOKIE_NAME);
}
