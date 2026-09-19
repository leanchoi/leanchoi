import { describe, expect, it } from 'vitest';
import { parseEnv } from '@/lib/env';

const BASE = {
  DATABASE_URL: 'postgres://u:p@db:5432/relevamiento',
  SESSION_SECRET: 'x'.repeat(32),
};

describe('configuración por entorno', () => {
  it('acepta la configuración mínima y aplica los valores por defecto', () => {
    const res = parseEnv(BASE);
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.PORT).toBe(3000);
    expect(res.data.NODE_ENV).toBe('development');
    expect(res.data.MAIL_TRANSPORT).toBe('console');
    expect(res.data.TZ).toBe('America/Argentina/Buenos_Aires');
  });

  it('exige DATABASE_URL y un SESSION_SECRET de al menos 32 caracteres', () => {
    const sinBase = parseEnv({ SESSION_SECRET: 'x'.repeat(32) });
    expect(sinBase.success).toBe(false);

    const secretoCorto = parseEnv({ ...BASE, SESSION_SECRET: 'corto' });
    expect(secretoCorto.success).toBe(false);
  });

  it('toma el puerto del entorno y deriva de ahí la URL pública', () => {
    const res = parseEnv({ ...BASE, PORT: '8137' });
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.PORT).toBe(8137);
    expect(res.data.APP_BASE_URL).toBe('http://localhost:8137');
  });

  it('respeta APP_BASE_URL cuando está declarada', () => {
    const res = parseEnv({
      ...BASE,
      PORT: '8137',
      APP_BASE_URL: 'https://relevamiento.esquel.gob.ar',
    });
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.APP_BASE_URL).toBe('https://relevamiento.esquel.gob.ar');
  });

  it('rechaza puertos fuera de rango', () => {
    expect(parseEnv({ ...BASE, PORT: '0' }).success).toBe(false);
    expect(parseEnv({ ...BASE, PORT: '70000' }).success).toBe(false);
    expect(parseEnv({ ...BASE, PORT: 'ocho mil' }).success).toBe(false);
  });

  it('interpreta los flags de texto como booleanos', () => {
    const res = parseEnv({
      ...BASE,
      FEATURE_AUDIO: 'true',
      FEATURE_CLUSTERING: 'si',
      DATABASE_SSL: '0',
    });
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.FEATURE_AUDIO).toBe(true);
    expect(res.data.FEATURE_CLUSTERING).toBe(true);
    expect(res.data.FEATURE_TRANSCRIPCION).toBe(false);
    expect(res.data.DATABASE_SSL).toBe(false);
  });

  it('los proveedores de audio arrancan siempre en stub (sin red)', () => {
    const res = parseEnv(BASE);
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.TRANSCRIPTION_PROVIDER).toBe('stub');
    expect(res.data.CLUSTERING_PROVIDER).toBe('stub');
    expect(res.data.FEATURE_AUDIO).toBe(false);
  });
});

describe('la versión no se desincroniza', () => {
  it('APP_VERSION, package.json y el CHANGELOG dicen lo mismo', async () => {
    const { APP_VERSION } = await import('@/lib/version');
    const { readFileSync } = await import('node:fs');

    const paquete = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
    const changelog = readFileSync('CHANGELOG.md', 'utf8');

    expect(APP_VERSION).toBe(paquete.version);
    expect(changelog).toContain(`## [${APP_VERSION}]`);
  });
});
