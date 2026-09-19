import { expect, test } from '@playwright/test';
import { ingresar, iniciarJornada } from './apoyo';

/**
 * La devolución vista desde afuera: el vecino consultando su pedido y el informe
 * que se cuelga en la sede vecinal.
 */

test('el vecino consulta su pedido sin cuenta y sin que le pidan nada más', async ({ page }) => {
  await page.goto('/ticket');
  await expect(page.getByRole('heading', { name: /en qué quedó mi pedido/i })).toBeVisible();

  // Con datos que no existen, el mensaje no confirma ni desmiente nada.
  await page.getByRole('button', { name: 'Con apellido y DNI' }).click();
  await page.getByLabel('Apellido').fill('ApellidoQueNoExiste');
  await page.getByLabel('Últimos 3 números del DNI').fill('000');
  await page.getByRole('button', { name: 'Consultar' }).click();
  await expect(page.getByText(/no encontramos un pedido con esos datos/i)).toBeVisible();
});

test('el ticket que sale de la calle se puede consultar después', async ({ page }) => {
  await iniciarJornada(page);

  // Una encuesta completa, hasta el comprobante.
  const vivienda = page.getByRole('button', { name: /M0[0-9]-L0[0-9]/ }).first();
  await vivienda.click();
  await page.getByRole('button', { name: 'Hacer la encuesta' }).click();
  await page.getByRole('button', { name: 'El vecino acepta y empezamos' }).click();

  for (let i = 0; i < 60; i += 1) {
    const entrega = page.getByRole('button', { name: 'Listo, se lo entregué' });
    if (await entrega.isVisible().catch(() => false)) {
      await entrega.click();
      continue;
    }
    const devolucion = page.getByRole('button', {
      name: 'Cerrar el bloque y devolver el teléfono',
    });
    if (await devolucion.isVisible().catch(() => false)) {
      await devolucion.click();
      continue;
    }
    const cierre = page.getByRole('button', { name: 'Cerrar la encuesta y darle el ticket' });
    if (await cierre.isVisible().catch(() => false)) {
      await cierre.click();
      break;
    }
    const opciones = page.locator('button[aria-pressed]');
    if ((await opciones.count()) > 0) await opciones.first().click();
    const numero = page.locator('input[type="number"]');
    if ((await numero.count()) > 0) await numero.fill('2');
    const texto = page.locator('input[type="text"]');
    if ((await texto.count()) > 0) await texto.fill('Prueba');
    const area = page.locator('textarea');
    if ((await area.count()) > 0) await area.first().fill('Prueba');
    await page.getByRole('button', { name: 'Siguiente' }).click();
  }

  await page.getByRole('button', { name: 'No quiere dejar datos' }).click();

  const codigo = await page.getByText(/^ESQ-[A-Z0-9]{4}-[A-Z0-9]{4}$/).innerText();
  expect(codigo).toMatch(/^ESQ-/);

  // Se sincroniza y el vecino ya puede consultarlo.
  await page.getByRole('button', { name: 'Seguir con la próxima vivienda' }).click();
  await page.getByRole('button', { name: 'Sincronizar' }).click();
  await expect(page.getByText(/Enviados \d+ de \d+/)).toBeVisible({ timeout: 15_000 });

  await page.goto(`/ticket?codigo=${codigo}`);
  await page.getByRole('button', { name: 'Consultar' }).click();
  await expect(page.getByText(codigo)).toBeVisible();
  await expect(page.getByText(/su pedido está registrado/i)).toBeVisible();
});

test('el informe del barrio se lee sin login y dice lo que se comprometió', async ({ page }) => {
  await page.goto('/informes/28-de-junio');
  await expect(page.getByRole('heading', { name: /barrio 28 de junio/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /cuántas casas se visitaron/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /lo que el barrio priorizó/i })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /lo que se comprometió el municipio/i }),
  ).toBeVisible();
});

test('el encuestador no entra a las derivaciones', async ({ page }) => {
  await ingresar(page, undefined, undefined, '/panel');
  await page.goto('/panel/derivaciones');
  await expect(page.getByText(/no tenés acceso a esta sección/i)).toBeVisible();
});

test('sin sesión, el panel manda a ingresar', async ({ page }) => {
  await page.goto('/panel');
  await expect(page).toHaveURL(/\/ingresar/);
});
