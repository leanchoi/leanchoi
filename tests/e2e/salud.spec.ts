import { expect, test } from '@playwright/test';

test('el endpoint de salud responde con el estado del servicio y de la base', async ({
  request,
}) => {
  const respuesta = await request.get('/api/health');
  const cuerpo = await respuesta.json();

  expect(cuerpo).toMatchObject({ servicio: 'relevamiento-barrial-esquel' });
  expect(['ok', 'degradado']).toContain(cuerpo.estado);
});

test('la portada muestra los cuatro módulos del ciclo', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: /relevamiento barrial casa por casa/i }),
  ).toBeVisible();
  await expect(page.getByText('1. Instrumento')).toBeVisible();
  await expect(page.getByText('2. Campo')).toBeVisible();
  await expect(page.getByText('3. Procesamiento')).toBeVisible();
  await expect(page.getByText('4. Devolución')).toBeVisible();
});
