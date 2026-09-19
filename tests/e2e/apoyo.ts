import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Ayudas compartidas por las pruebas de punta a punta.
 *
 * Los usuarios de prueba salen del seed de demostración:
 *   SEED_DEMO=true SEED_DEMO_PASSWORD=demo-esquel-2026 npm run db:seed
 */
export const USUARIO_ENCUESTADOR = 'encuestador.demo';
export const PASSWORD_DEMO = process.env.E2E_PASSWORD ?? 'demo-esquel-2026';

export async function ingresar(
  page: Page,
  usuario = USUARIO_ENCUESTADOR,
  password = PASSWORD_DEMO,
  destino = '/campo',
) {
  await page.goto(`/ingresar?destino=${encodeURIComponent(destino)}`);
  await page.getByLabel('Usuario').fill(usuario);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL(`**${destino}`);
}

/** Entra y arranca la jornada en el barrio asignado. */
export async function iniciarJornada(page: Page) {
  await ingresar(page);
  await expect(page.getByRole('heading', { name: 'Relevamiento barrial' })).toBeVisible();
  await expect(page.getByText('Tu barrio asignado')).toBeVisible();
  await page.getByRole('button', { name: 'Empezar la jornada' }).click();
  await expect(page.getByRole('heading', { name: 'Viviendas' })).toBeVisible({ timeout: 15_000 });
}
