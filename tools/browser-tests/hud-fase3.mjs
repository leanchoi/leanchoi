/**
 * Capturas de la Fase 3: el HUD con misiones y zonas, la escalera de rangos y
 * la campaña del Modo Candidato. Un solo vecino conectado al servidor real.
 */
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';

// Raíz del repo, deducida de la ubicación de este archivo.
const REPO = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const SECRET = 'secreto-navegador-esquel-2027-abcdefghijk';
const out = process.argv[2];

const freePort = () =>
  new Promise((resolve) => {
    const p = createServer();
    p.listen(0, '127.0.0.1', () => {
      const { port } = p.address();
      p.close(() => resolve(port));
    });
  });
const PORT = await freePort();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn(process.execPath, [`${REPO}/server-vps/dist/index.js`], {
  env: {
    ...process.env,
    NODE_ENV: 'development',
    PORT: String(PORT),
    JWT_SECRET: SECRET,
    HOSTINGER_API_KEY: 'test',
    HOSTINGER_API_URL: 'http://127.0.0.1:9/api',
    SHARD_NAME: 'Esquel — Plaza',
    CORS_ORIGIN: 'http://localhost:4173,http://127.0.0.1:4173',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const log = [];
server.stdout.on('data', (c) => log.push(c.toString()));
server.stderr.on('data', (c) => log.push(c.toString()));

const jwt = execFileSync(
  'php',
  [`${REPO}/backend-php/tests/jwt-cli.php`, 'issue', SECRET, 'Beto el Puntero', '1001', '3', '5', 'centro'],
  { encoding: 'utf8' },
).trim();

for (let i = 0; i < 30; i++) {
  await sleep(500);
  try {
    if ((await fetch(`http://127.0.0.1:${PORT}/health`)).ok) break;
  } catch {}
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const url =
  `http://localhost:4173/?token=${encodeURIComponent(jwt)}&rt=${encodeURIComponent(`ws://127.0.0.1:${PORT}`)}` +
  `&hora=17.5&spawn=-2,-30&alias=${encodeURIComponent('Beto el Puntero')}&faccion=3&rango=5`;
await page.goto(url, { waitUntil: 'networkidle' });
await sleep(16000);

const misiones = await page.locator('.quests__card').count();
const zonas = await page.locator('.zones__row').count();
console.log(`  misiones en el rastreador: ${misiones} · zonas replicadas: ${zonas}`);
await page.screenshot({ path: `${out}/fase3-hud.png` });

// Anotarse en la primera misión que ofrezca el botón.
const anotarme = page.getByRole('button', { name: 'Anotarme' }).first();
if ((await anotarme.count()) > 0) {
  await anotarme.click();
  await sleep(1500);
  await page.screenshot({ path: `${out}/fase3-mision.png` });
  console.log(`  anotado: ${await page.locator('.quests__card.is-joined').count()} misión(es) propias`);
}

await page.getByRole('button', { name: 'Carrera' }).click();
await sleep(900);
await page.screenshot({ path: `${out}/fase3-carrera.png` });
await page.locator('.campaign__cerrar').click();

await page.getByRole('button', { name: 'Modo Candidato' }).click();
await sleep(700);
await page.screenshot({ path: `${out}/fase3-arquetipos.png` });
await page.locator('.arquetipo').nth(1).click();
await sleep(700);
await page.screenshot({ path: `${out}/fase3-campana.png` });
const dilema = await page.locator('.campaign__dilema h3').textContent();
console.log(`  primer dilema del Outsider: ${dilema}`);

// Jugar la campaña entera clickeando la primera opción de cada dilema.
for (let i = 0; i < 14; i++) {
  const opciones = page.locator('.campaign__opcion');
  if ((await opciones.count()) === 0) break;
  await opciones.first().click();
  await sleep(220);
}
const final = await page.locator('.campaign__final h3').textContent().catch(() => null);
console.log(`  final de la campaña: ${final ?? 'no terminó'}`);
if (final) {
  await page.screenshot({ path: `${out}/fase3-final.png` });
  await page.getByRole('button', { name: 'Cobrar la campaña' }).click();
  await sleep(1500);
  const chat = await page.locator('.chat-log__line').last().textContent();
  console.log(`  liquidación: ${chat?.trim()}`);
}

await browser.close();
server.kill('SIGTERM');
console.log('  ✓ capturas listas');
