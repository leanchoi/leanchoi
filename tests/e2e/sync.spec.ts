import { expect, test } from '@playwright/test';
import { ingresar, iniciarJornada, PASSWORD_DEMO } from './apoyo';

/**
 * El circuito completo con servidor: entrar con usuario y contraseña, cargar en la
 * calle, y que lo cargado llegue y se borre del teléfono.
 */

test('sin sesión, la app de campo pide entrar', async ({ page }) => {
  await page.goto('/campo');
  await expect(page.getByRole('link', { name: 'Ingresar' })).toBeVisible();
});

test('con usuario y contraseña equivocados no se entra', async ({ page }) => {
  await page.goto('/ingresar');
  await page.getByLabel('Usuario').fill('encuestador.demo');
  await page.getByLabel('Contraseña').fill('esta-no-es');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText(/usuario o contraseña incorrectos/i)).toBeVisible();
});

test('la cookie de sesión no se puede leer desde el navegador', async ({ page }) => {
  await ingresar(page);
  const visibles = await page.evaluate(() => document.cookie);
  expect(visibles).not.toContain('rbe_sesion');
});

test('lo cargado en la calle llega al servidor y se borra del teléfono', async ({ page }) => {
  await iniciarJornada(page);

  // Una vivienda que no estaba en la lista, cerrada sin respuesta.
  const identificador = `E2E-${Date.now()}`;
  await page.getByPlaceholder('Manzana / lote o referencia').fill(identificador);
  await page.getByRole('button', { name: 'Agregar' }).click();

  await page.getByRole('button', { name: new RegExp(identificador) }).click();
  await page.getByRole('button', { name: 'Cerrar sin respuesta' }).click();
  await page.getByRole('button', { name: 'La vivienda está deshabitada' }).click();

  await expect(page.getByRole('button', { name: /^Cola \(\d+\)$/ })).toBeVisible();

  // Sincronizar: el servidor confirma y la cola queda vacía.
  await page.getByRole('button', { name: 'Sincronizar' }).click();
  await expect(page.getByText(/Enviados \d+ de \d+/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Cola' })).toBeVisible();

  await page.getByRole('button', { name: 'Cola' }).click();
  await expect(page.getByText(/no hay nada esperando/i)).toBeVisible();
});

test('el vecinalista solo entra a lo suyo: no hay panel para su rol', async ({ page }) => {
  await ingresar(page);

  // La API de barrios solo le devuelve el suyo.
  // page.request comparte las cookies de la sesión del navegador.
  const respuesta = await page.request.get('/api/campo/barrios');
  const cuerpo = await respuesta.json();
  expect(cuerpo.barrios).toHaveLength(1);
  expect(cuerpo.barrioAsignado).toBeTruthy();

  // Y el password nunca vuelve del servidor.
  const yo = await (await page.request.get('/api/auth/yo')).json();
  expect(JSON.stringify(yo)).not.toContain(PASSWORD_DEMO);
  expect(JSON.stringify(yo)).not.toMatch(/hash|password/i);
});
