import { expect, test } from '@playwright/test';
import { ingresar } from './apoyo';

/**
 * El tablero: lo que mira la conducción, la coordinación de barrio y las áreas.
 * Todo agregado, nada individual, y el export siempre anonimizado.
 */

test('la conducción ve cobertura, no-respuesta y derivaciones', async ({ page }) => {
  await ingresar(page, 'conduccion.demo', undefined, '/panel/tablero');

  await expect(page.getByRole('heading', { name: 'Tablero' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Cobertura', exact: true })).toBeVisible();
  await expect(page.getByText('No-respuesta', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: /por qué no se pudo relevar/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Derivaciones' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Exportar' })).toBeVisible();
});

test('se puede mirar un barrio en particular', async ({ page }) => {
  await ingresar(page, 'conduccion.demo', undefined, '/panel/tablero');

  await page.getByRole('combobox').selectOption('28-de-junio');
  await page.getByRole('button', { name: 'Ver' }).click();

  await expect(page.getByText('Barrio 28 de Junio')).toBeVisible();
});

test('el CSV que se descarga no permite volver al vecino', async ({ page }) => {
  await ingresar(page, 'conduccion.demo', undefined, '/panel/tablero');

  const respuesta = await page.request.get('/api/export/respuestas.csv');
  expect(respuesta.ok()).toBe(true);
  expect(respuesta.headers()['content-type']).toContain('text/csv');

  const csv = await respuesta.text();
  const encabezado = csv.replace('﻿', '').split('\r\n')[0] ?? '';
  expect(encabezado).toMatch(/^n,barrio,fecha/);
  expect(encabezado).not.toMatch(/ticket|codigo|dispositivo|lat|lng|vivienda|encuestador/i);
  expect(csv).not.toMatch(/ESQ-[A-Z0-9]{4}-[A-Z0-9]{4}/);
});

test('la coordinación de barrio ve su barrio y no puede elegir otro', async ({ page }) => {
  await ingresar(page, 'coordinador.demo', undefined, '/panel/tablero');

  await expect(page.getByRole('heading', { name: 'Tablero' })).toBeVisible();
  await expect(page.getByText('Barrio 28 de Junio')).toBeVisible();
  // Sin selector: su barrio es su barrio.
  await expect(page.getByRole('combobox')).toHaveCount(0);
  // Y sin exports.
  await expect(page.getByRole('heading', { name: 'Exportar' })).toHaveCount(0);
});

test('el encuestador no entra al tablero ni a los exports', async ({ page }) => {
  await ingresar(page, 'encuestador.demo', undefined, '/panel');
  await page.goto('/panel/tablero');
  await expect(page.getByText(/no tenés acceso al tablero/i)).toBeVisible();

  const respuesta = await page.request.get('/api/export/respuestas.csv');
  expect(respuesta.status()).toBe(403);
});
