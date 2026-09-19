import { NextResponse } from 'next/server';
import { z } from 'zod';
import { abrirSesion } from '@/lib/auth/guardias';
import { verificarPassword } from '@/lib/auth/password';
import { aSesion, buscarPorUsuario } from '@/lib/auth/usuarios';

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

/** Freno simple contra prueba y error. El control serio llega en la fase 8. */
const intentos = new Map<string, { cantidad: number; hasta: number }>();
const MAX_INTENTOS = 8;
const VENTANA_MS = 5 * 60_000;

function demasiadosIntentos(clave: string): boolean {
  const registro = intentos.get(clave);
  if (!registro) return false;
  if (Date.now() > registro.hasta) {
    intentos.delete(clave);
    return false;
  }
  return registro.cantidad >= MAX_INTENTOS;
}

function anotarIntento(clave: string): void {
  const registro = intentos.get(clave);
  if (!registro || Date.now() > registro.hasta) {
    intentos.set(clave, { cantidad: 1, hasta: Date.now() + VENTANA_MS });
    return;
  }
  registro.cantidad += 1;
}

export async function POST(request: Request) {
  const parseo = Entrada.safeParse(await request.json().catch(() => null));
  if (!parseo.success) {
    return NextResponse.json({ error: 'datos_invalidos' }, { status: 400 });
  }

  const clave = `${request.headers.get('x-forwarded-for') ?? 'local'}:${parseo.data.usuario}`;
  if (demasiadosIntentos(clave)) {
    return NextResponse.json(
      { error: 'demasiados_intentos', detalle: 'Esperá unos minutos y volvé a probar.' },
      { status: 429 },
    );
  }

  const fila = await buscarPorUsuario(parseo.data.usuario);
  const valida = fila ? await verificarPassword(parseo.data.password, fila.hashPassword) : false;

  if (!fila || !valida || !fila.activo) {
    anotarIntento(clave);
    return NextResponse.json(
      { error: 'credenciales_invalidas', detalle: 'Usuario o contraseña incorrectos.' },
      { status: 401 },
    );
  }

  intentos.delete(clave);
  const usuario = aSesion(fila);
  await abrirSesion(usuario);

  return NextResponse.json({ usuario });
}
