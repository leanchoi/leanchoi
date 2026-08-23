/**
 * El cartel de ascenso, en un navegador de verdad.
 *
 * Entra un vecino a un pelo del umbral de Soldado, pega un afiche y se verifica
 * que el cartel aparezca en pantalla — que es donde el momento tiene que
 * aterrizar. Hasta la auditoría este camino no existía: la XP subía y el rango
 * no se movía nunca.
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
    p.listen(0, '127.0.0.1', () => { const { port } = p.address(); p.close(() => resolve(port)); });
  });
const PORT = await freePort();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn(process.execPath, [`${REPO}/server-vps/dist/index.js`], {
  env: { ...process.env, NODE_ENV: 'development', PORT: String(PORT), JWT_SECRET: SECRET,
    HOSTINGER_API_KEY: 'test', HOSTINGER_API_URL: 'http://127.0.0.1:9/api',
    SHARD_NAME: 'Esquel - Ascenso', CORS_ORIGIN: 'http://localhost:4173' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const log = [];
server.stdout.on('data', (c) => log.push(c.toString()));
server.stderr.on('data', (c) => log.push(c.toString()));

// El CLI mintea con xp/reputación/lealtad al filo del rango 2.
const jwt = execFileSync('php', [
  `${REPO}/backend-php/tests/jwt-cli.php`, 'issue', SECRET, 'Petiso al filo', '9001', '3', '1', 'centro',
  '899', '40', '0.4',
], { encoding: 'utf8' }).trim();

for (let i = 0; i < 30; i++) {
  await sleep(500);
  // El servidor todavía no levantó: se reintenta. Cualquier otro fallo también
  // se reintenta acá, y si no levanta en 15 s el `goto` de abajo falla solo.
  try {
    if ((await fetch(`http://127.0.0.1:${PORT}/health`)).ok) break;
  } catch {
    /* todavía no escucha */
  }
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errores = [];
page.on('pageerror', (e) => errores.push(e.message));

const url = `http://localhost:4173/?token=${encodeURIComponent(jwt)}&rt=${encodeURIComponent(`ws://127.0.0.1:${PORT}`)}&hora=13&spawn=-2,-26&alias=${encodeURIComponent('Petiso al filo')}&faccion=3&rango=1`;
await page.goto(url, { waitUntil: 'networkidle' });
await sleep(14000);

const check = [];
const ok = (n, c, d = '') => { check.push(c); console.log(`  ${c ? '✓' : '✗'} ${n}${d ? ` — ${d}` : ''}`); };

// El badge tarda en pasar de "Conectando" a "En línea": se espera, no se
// fotografía en un instante arbitrario.
await page.waitForFunction(
  () => document.querySelector('.net-badge')?.textContent?.includes('En línea') ?? false,
  { timeout: 15000 },
).catch(() => undefined);
const badge = await page.locator('.net-badge').innerText().catch(() => '(sin badge)');
ok('El vecino está en línea', /En línea/i.test(badge), badge.replace(/\n/g, ' '));

// Pega un afiche: con 899 XP, los 20 del afiche lo cruzan.
await page.locator('canvas').click({ position: { x: 640, y: 400 } });
await page.keyboard.press('KeyE');
await sleep(2500);

const cartel = await page.locator('.momento--ascenso').count();
const texto = cartel ? await page.locator('.momento--ascenso').innerText() : '';
ok('Aparece el cartel de ascenso', cartel === 1, texto.replace(/\n/g, ' · '));
if (cartel) await page.screenshot({ path: `${out}/ascenso.png` });

const chat = await page.locator('.chat-log').innerText().catch(() => '');
ok('El chat lo canta', /Ascendiste a Soldado/.test(chat));

// Y se va solo.
await sleep(7000);
ok('El cartel se retira solo', (await page.locator('.momento--ascenso').count()) === 0);

ok('Sin errores de consola', errores.length === 0, errores.slice(0, 1).join(''));

await browser.close();
server.kill('SIGTERM');
const verdes = check.filter(Boolean).length;
console.log(`\n  ${verdes}/${check.length} verificaciones en verde`);
if (verdes !== check.length) { console.log(log.join('').slice(-1500)); process.exit(1); }
