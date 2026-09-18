import { NextResponse } from 'next/server';
import { pingDatabase } from '@/db/client';
import { APP_VERSION } from '@/lib/version';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/health
 *
 * - 200 {"estado":"ok"}        -> app viva y base alcanzable
 * - 503 {"estado":"degradado"} -> app viva pero la base no responde
 *
 * `?db=skip` hace un chequeo de vida solamente (no toca Postgres) y siempre
 * responde 200 si el proceso está arriba. Ver HANDOFF.md.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const saltearDb = url.searchParams.get('db') === 'skip';

  const base = {
    servicio: 'relevamiento-barrial-esquel',
    version: APP_VERSION,
    timestamp: new Date().toISOString(),
    uptimeSegundos: Math.round(process.uptime()),
  };

  if (saltearDb) {
    return NextResponse.json({ estado: 'ok', ...base, base_de_datos: 'no_verificada' });
  }

  const ping = await pingDatabase();
  if (!ping.ok) {
    return NextResponse.json(
      {
        estado: 'degradado',
        ...base,
        base_de_datos: { estado: 'error', latenciaMs: ping.latenciaMs, detalle: ping.error },
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    estado: 'ok',
    ...base,
    base_de_datos: { estado: 'ok', latenciaMs: ping.latenciaMs },
  });
}
