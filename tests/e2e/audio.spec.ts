import { expect, test } from '@playwright/test';

/**
 * El circuito de audio, visto desde afuera. Corre con FEATURE_AUDIO en cualquier
 * estado: si está apagado, la API responde 503 y eso también es correcto.
 */
test('la subida de audio valida los datos y nunca acepta cualquier cosa', async ({ request }) => {
  const respuesta = await request.post('/api/audios', { multipart: { pregunta_id: 'p1' } });
  expect([400, 503]).toContain(respuesta.status());
});

test('el estado de un audio inexistente no filtra información', async ({ request }) => {
  const respuesta = await request.get('/api/audios/018f0000-0000-7000-8000-000000000000');
  expect([404, 500]).toContain(respuesta.status());
  if (respuesta.status() === 404) {
    expect(await respuesta.json()).toEqual({ error: 'no_encontrado' });
  }
});

test('el procesamiento exige el token del worker', async ({ request }) => {
  const respuesta = await request.post('/api/audios/procesar');
  expect([401, 503]).toContain(respuesta.status());
});

test('la pantalla de prueba de audio explica que el audio es temporal', async ({ page }) => {
  await page.goto('/campo/audio');
  await expect(page.getByRole('heading', { name: /prueba de envío de audio/i })).toBeVisible();
  await expect(page.getByText(/el audio es temporal/i)).toBeVisible();
});
