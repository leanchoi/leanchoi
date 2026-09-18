/**
 * Consulta el endpoint de salud y devuelve código 0 (sano) o 1 (enfermo).
 *
 *   npm run healthcheck
 *   PORT=8080 npm run healthcheck
 *
 * Sirve tanto para el HEALTHCHECK del contenedor como para el checklist de deploy.
 */
import 'dotenv/config';

const puerto = process.env.PORT ?? '3000';
const url = process.env.HEALTHCHECK_URL ?? `http://127.0.0.1:${puerto}/api/health`;

async function main(): Promise<void> {
  const control = new AbortController();
  const timeout = setTimeout(() => control.abort(), 10_000);

  try {
    const respuesta = await fetch(url, { signal: control.signal, cache: 'no-store' });
    const cuerpo: unknown = await respuesta.json().catch(() => null);
    console.log(`${respuesta.status} ${url}`);
    console.log(JSON.stringify(cuerpo, null, 2));
    process.exit(respuesta.ok ? 0 : 1);
  } catch (error) {
    console.error(`✖ Sin respuesta de ${url}:`, error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    clearTimeout(timeout);
  }
}

void main();
