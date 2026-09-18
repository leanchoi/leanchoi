import { expect, test } from '@playwright/test';

/**
 * REGLA 10 de punta a punta: la ruta pública muestra el cuestionario completo sin
 * ninguna sesión.
 */

test('el cuestionario se lee sin login, completo y con su changelog', async ({ page }) => {
  await page.goto('/cuestionario');

  await expect(
    page.getByRole('heading', { name: /relevamiento barrial casa por casa/i }),
  ).toBeVisible();
  await expect(page.getByText(/versión 1 · publicada el/i).first()).toBeVisible();

  // El consentimiento, con su finalidad declarada.
  await expect(page.getByRole('heading', { name: /antes de empezar/i })).toBeVisible();
  await expect(page.getByText(/para qué se usan los datos/i)).toBeVisible();

  // Las preguntas, con el motivo de cada una.
  await expect(
    page.getByRole('heading', { name: /¿hace cuánto tiempo vive en este barrio\?/i }),
  ).toBeVisible();
  await expect(page.getByText(/para qué se pregunta/i).first()).toBeVisible();

  // El bloque autoadministrado se anuncia como tal.
  await expect(page.getByText(/bloque autoadministrado/i).first()).toBeVisible();

  // El changelog de versiones.
  await expect(page.getByRole('heading', { name: /versiones del cuestionario/i })).toBeVisible();
});

test('la versión vigente también está disponible como datos abiertos', async ({ request }) => {
  const respuesta = await request.get('/api/cuestionario');
  expect(respuesta.ok()).toBe(true);

  const cuerpo = await respuesta.json();
  expect(cuerpo.version).toBe(1);
  expect(cuerpo.consentimiento_version).toBeTruthy();
  expect(cuerpo.definicion.bloques.length).toBeGreaterThan(1);

  // El instrumento, nunca las respuestas.
  const texto = JSON.stringify(cuerpo);
  expect(texto).not.toMatch(/"ticket"|"contacto"|"dni"/);
});
