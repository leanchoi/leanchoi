import { NextResponse } from 'next/server';

/**
 * Techo al tamaño del cuerpo de un pedido.
 *
 * El celular sincroniza lotes que pueden ser grandes, pero no infinitos. Sin este
 * techo, un solo POST mal intencionado —o un bug en el cliente— basta para que el
 * proceso se quede sin memoria armando un JSON gigante.
 */

export class CuerpoDemasiadoGrande extends Error {
  constructor(readonly maxBytes: number) {
    super(`El cuerpo del pedido supera el máximo de ${Math.round(maxBytes / 1024)} KB.`);
    this.name = 'CuerpoDemasiadoGrande';
  }
}

/**
 * Lee el JSON del pedido cortando a los `maxBytes`. Mira primero `Content-Length`
 * —que evita leer nada— y después corta mientras lee, porque esa cabecera puede
 * mentir o no venir.
 */
export async function leerJsonLimitado(
  request: Request,
  maxBytes: number,
): Promise<unknown | null> {
  const declarado = Number(request.headers.get('content-length') ?? '');
  if (Number.isFinite(declarado) && declarado > maxBytes) {
    throw new CuerpoDemasiadoGrande(maxBytes);
  }

  const cuerpo = request.body;
  if (!cuerpo) return null;

  const lector = cuerpo.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await lector.cancel().catch(() => undefined);
      throw new CuerpoDemasiadoGrande(maxBytes);
    }
    partes.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const parte of partes) {
    bytes.set(parte, offset);
    offset += parte.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return null;
  }
}

/** Traduce el exceso de tamaño a un 413 con un mensaje que se entiende. */
export function respuestaCuerpoGrande(error: unknown): NextResponse | null {
  if (error instanceof CuerpoDemasiadoGrande) {
    return NextResponse.json(
      { error: 'cuerpo_demasiado_grande', detalle: error.message },
      { status: 413 },
    );
  }
  return null;
}
