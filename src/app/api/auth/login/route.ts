import { NextResponse } from 'next/server';
import { z } from 'zod';
import { abrirSesion } from '@/lib/auth/guardias';
import { verificarPassword } from '@/lib/auth/password';
import { aSesion, buscarPorUsuario } from '@/lib/auth/usuarios';
import { getEnv } from '@/lib/env';
import { cabecerasDeEspera, clienteDe, frenoPerezoso } from '@/lib/seguridad/freno';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/login — usuario y contraseña. Nada más.
 *
 * La respuesta nunca dice si falló el usuario o la contraseña: eso solo le sirve a
 * quien está probando nombres.
 */
const Entrada = z.object({
  usuario: z.string().min(1).max(120),
  password: z.string().min(1).max(200),
});

/**
 * Freno contra prueba y error, por IP **y** usuario: quien se equivoca la clave
 * no deja afuera a todo el barrio, y quien prueba claves ajenas se frena igual.
 */
const freno = frenoPerezoso(() => ({
  maximo: getEnv().LOGIN_MAX_INTENTOS,
  ventanaMs: getEnv().LOGIN_VENTANA_MINUTOS * 60_000,
}));

export async function POST(request: Request) {
  const parseo = Entrada.safeParse(await request.json().catch(() => null));
  if (!parseo.success) {
    return NextResponse.json({ error: 'datos_invalidos' }, { status: 400 });
  }

  const clave = `${clienteDe(request)}:${parseo.data.usuario.toLowerCase()}`;
  const veredicto = freno.registrar(clave);
  if (veredicto.frenado) {
    return NextResponse.json(
      { error: 'demasiados_intentos', detalle: 'Esperá unos minutos y volvé a probar.' },
      { status: 429, headers: cabecerasDeEspera(veredicto) },
    );
  }

  const fila = await buscarPorUsuario(parseo.data.usuario);
  const valida = fila ? await verificarPassword(parseo.data.password, fila.hashPassword) : false;

  if (!fila || !valida || !fila.activo) {
    return NextResponse.json(
      { error: 'credenciales_invalidas', detalle: 'Usuario o contraseña incorrectos.' },
      { status: 401 },
    );
  }

  freno.perdonar(clave);
  const usuario = aSesion(fila);
  await abrirSesion(usuario);

  return NextResponse.json({ usuario });
}
