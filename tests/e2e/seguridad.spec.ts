import { expect, test } from '@playwright/test';
import { ingresar, PASSWORD_DEMO } from './apoyo';

/**
 * Endurecimiento (fase 8). Todo esto se verifica contra el servidor real porque es
 * exactamente lo que no se puede verificar en un test unitario: las cabeceras las
 * pone Next, no nuestro código, y los frenos solo cuentan de verdad sobre HTTP.
 */

test('la app llega con las cabeceras de seguridad puestas', async ({ request }) => {
  const respuesta = await request.get('/');
  const cabeceras = respuesta.headers();

  expect(cabeceras['x-content-type-options']).toBe('nosniff');
  expect(cabeceras['x-frame-options']).toBe('DENY');
  expect(cabeceras['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(cabeceras['permissions-policy']).toContain('camera=()');
  expect(cabeceras['cross-origin-opener-policy']).toBe('same-origin');

  const csp = cabeceras['content-security-policy'] ?? '';
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");

  // Y no se anuncia con qué está hecho.
  expect(cabeceras['x-powered-by']).toBeUndefined();
});

test('lo privado no va a los buscadores; lo público del operativo sí', async ({ request }) => {
  for (const ruta of ['/panel', '/campo', '/ticket']) {
    const respuesta = await request.get(ruta, { maxRedirects: 0 });
    expect(respuesta.headers()['x-robots-tag'], ruta).toContain('noindex');
  }

  const publico = await request.get('/cuestionario');
  expect(publico.headers()['x-robots-tag']).toBeUndefined();
});

test('la CSP no rompe la app: el cuestionario público se hidrata y responde', async ({ page }) => {
  const errores: string[] = [];
  page.on('console', (mensaje) => {
    if (mensaje.type() === 'error') errores.push(mensaje.text());
  });

  await page.goto('/cuestionario');
  await expect(page.getByRole('heading', { name: /cuestionario/i }).first()).toBeVisible();

  expect(errores.filter((texto) => /content security policy|csp/i.test(texto))).toEqual([]);
});

test('probar contraseñas a repetición termina en 429 con Retry-After', async ({ request }) => {
  // Usuario inexistente y propio de este test: no frena a nadie más.
  const usuario = `inexistente.${Date.now()}`;
  let frenada: Awaited<ReturnType<typeof request.post>> | null = null;

  for (let intento = 0; intento < 12; intento += 1) {
    const respuesta = await request.post('/api/auth/login', {
      data: { usuario, password: 'lo-que-sea' },
    });
    if (respuesta.status() === 429) {
      frenada = respuesta;
      break;
    }
    expect(respuesta.status()).toBe(401);
  }

  expect(frenada, 'el freno de login nunca se activó').not.toBeNull();
  expect(Number(frenada?.headers()['retry-after'])).toBeGreaterThan(0);
  expect(await frenada?.json()).toMatchObject({ error: 'demasiados_intentos' });
});

test('el login no dice si erraste el usuario o la contraseña', async ({ request }) => {
  const inexistente = await request.post('/api/auth/login', {
    data: { usuario: `nadie.${Date.now()}`, password: 'x' },
  });
  const claveMala = await request.post('/api/auth/login', {
    data: { usuario: 'encuestador.demo', password: 'clave-equivocada-a-proposito' },
  });

  expect(inexistente.status()).toBe(401);
  expect(claveMala.status()).toBe(401);
  expect(await inexistente.json()).toEqual(await claveMala.json());
});

test('un lote de sincronización desmedido se corta con 413', async ({ page, request }) => {
  await ingresar(page);

  const enorme = {
    eventos: Array.from({ length: 20_000 }, (_, i) => ({
      id: `relleno-${i}`,
      ticket: '01a0c000-0000-7000-8000-00000000d999',
      tipo: 'encuesta',
      creadoEn: new Date().toISOString(),
      payload: { relleno: 'x'.repeat(500) },
    })),
  };

  const respuesta = await request.post('/api/sync', {
    data: enorme,
    headers: { cookie: (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ') },
  });

  expect(respuesta.status()).toBe(413);
  expect(await respuesta.json()).toMatchObject({ error: 'cuerpo_demasiado_grande' });
});

test('la contraseña de demostración no entra si el usuario está mal escrito', async ({ request }) => {
  const respuesta = await request.post('/api/auth/login', {
    data: { usuario: 'encuestador.demo.no-existe', password: PASSWORD_DEMO },
  });
  expect(respuesta.status()).toBe(401);
});
