import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { iniciarJornada } from './apoyo';

/**
 * La app de campo, de punta a punta en un navegador real: elegir barrio, hacer la
 * encuesta completa incluido el bloque que contesta el vecino, llegar al ticket, y
 * abrir todo de nuevo sin señal.
 */

/** Contesta lo que haya en pantalla, sea del tipo que sea. */
async function responderPantalla(page: Page) {
  const opciones = page.locator('button[aria-pressed]');
  if ((await opciones.count()) > 0) {
    await opciones.first().click();
    return;
  }
  const numero = page.locator('input[type="number"]');
  if ((await numero.count()) > 0) {
    await numero.fill('3');
    return;
  }
  const texto = page.locator('input[type="text"]');
  if ((await texto.count()) > 0) {
    await texto.fill('Una respuesta de prueba');
    return;
  }
  const area = page.locator('textarea');
  if ((await area.count()) > 0) await area.first().fill('Una respuesta hablada de prueba');
}

test('una encuesta completa termina en el ticket del vecino', async ({ page }) => {
  await iniciarJornada(page);

  await page.getByRole('button', { name: /M01-L01/ }).click();
  await page.getByRole('button', { name: 'Hacer la encuesta' }).click();

  // Regla 2: primero el consentimiento.
  await expect(page.getByRole('heading', { name: 'Antes de empezar' })).toBeVisible();
  await expect(page.getByText(/para qué se usan los datos/i)).toBeVisible();
  await page.getByRole('button', { name: 'El vecino acepta y empezamos' }).click();

  let vioModoVecino = false;

  for (let i = 0; i < 60; i += 1) {
    const entrega = page.getByRole('button', { name: 'Listo, se lo entregué' });
    if (await entrega.isVisible().catch(() => false)) {
      await entrega.click();
      // Regla 8: en modo vecino la pantalla queda limpia, sin nada del encuestador.
      await expect(page.getByRole('button', { name: 'Salir' })).toHaveCount(0);
      await expect(page.getByText(/el encuestador no va a ver estas respuestas/i)).toBeVisible();
      vioModoVecino = true;
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

    await responderPantalla(page);
    await page.getByRole('button', { name: 'Siguiente' }).click();
  }

  expect(vioModoVecino).toBe(true);

  // Los datos de contacto son opcionales: se pueden saltear.
  await expect(page.getByRole('heading', { name: /querés que te avisemos/i })).toBeVisible();
  await page.getByRole('button', { name: 'No quiere dejar datos' }).click();

  // El ticket: código legible y QR para que le saque una foto.
  await expect(page.getByRole('heading', { name: /este es el comprobante/i })).toBeVisible();
  await expect(page.getByText(/^ESQ-[A-Z0-9]{4}-[A-Z0-9]{4}$/)).toBeVisible();
  await expect(page.locator('img[alt^="Código QR"]')).toBeVisible();

  // Y quedó esperando en la cola, porque todavía no hay a quién mandarlo.
  await page.getByRole('button', { name: 'Seguir con la próxima vivienda' }).click();
  await expect(page.getByRole('button', { name: /^Cola \(\d+\)$/ })).toBeVisible();
});

test('una vivienda se cierra con motivo tipificado, nunca se saltea', async ({ page }) => {
  await iniciarJornada(page);

  await page.getByRole('button', { name: /M01-L02/ }).click();
  await expect(page.getByText(/una vivienda no se saltea/i)).toBeVisible();

  await page.getByRole('button', { name: 'Cerrar sin respuesta' }).click();
  await expect(page.getByText('¿Por qué no se pudo hacer?')).toBeVisible();
  await page.getByRole('button', { name: 'No había nadie' }).click();

  await expect(page.getByRole('heading', { name: 'Viviendas' })).toBeVisible();
  const fila = page.getByRole('button', { name: /M01-L02/ });
  await expect(fila).toContainText('Cerrada sin respuesta');
  await expect(fila).toContainText('1 intento');
});

test('la cola muestra lo que espera señal y no borra nada hasta que el servidor confirme', async ({
  page,
}) => {
  await iniciarJornada(page);

  await page.getByRole('button', { name: /M01-L03/ }).click();
  await page.getByRole('button', { name: 'Cerrar sin respuesta' }).click();
  await page.getByRole('button', { name: 'No se pudo acceder' }).click();

  await page.getByRole('button', { name: /^Cola \(\d+\)$/ }).click();
  await expect(page.getByRole('heading', { name: 'Cola de envío' })).toBeVisible();
  await expect(page.getByText('Cierre sin respuesta')).toBeVisible();
  await expect(
    page.getByText(/nada se borra del teléfono hasta que el servidor confirme/i),
  ).toBeVisible();
});

test('la app abre y sigue funcionando sin señal', async ({ page, context }) => {
  await iniciarJornada(page);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));

  await context.setOffline(true);
  await page.reload();

  await expect(page.getByText('sin señal')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Viviendas' })).toBeVisible();

  // Y se puede seguir trabajando: la encuesta arranca igual, sin servidor.
  await page.getByRole('button', { name: /M01-L04/ }).click();
  await page.getByRole('button', { name: 'Hacer la encuesta' }).click();
  await expect(page.getByRole('heading', { name: 'Antes de empezar' })).toBeVisible();
});
