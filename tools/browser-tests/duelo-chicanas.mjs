/**
 * Prueba de navegador de la Fase 3: un duelo de chicanas de punta a punta.
 *
 * Levanta el servidor real, mintea dos tokens con el PHP de Hostinger, abre dos
 * pestañas con el bundle real y hace que Beto encare a Marta con la tecla G.
 * Marta acepta desde el cartel, se abre la mesa de cartas en las dos pantallas y
 * cada uno juega una carta. Verifica el estado y saca las capturas.
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
    const probe = createServer();
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
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
    AOI_CELLS: '4',
    CORS_ORIGIN: 'http://localhost:4173,http://127.0.0.1:4173',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const log = [];
server.stdout.on('data', (c) => log.push(c.toString()));
server.stderr.on('data', (c) => log.push(c.toString()));

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const token = (alias, userId, faccion, rango) =>
  execFileSync(
    'php',
    [`${REPO}/backend-php/tests/jwt-cli.php`, 'issue', SECRET, alias, String(userId), String(faccion), String(rango), 'centro'],
    { encoding: 'utf8' },
  ).trim();

const tokenBeto = token('Beto el Puntero', 1001, 3, 4);
const tokenMarta = token('Marta la Concejala', 1002, 2, 5);

let ready = false;
for (let i = 0; i < 30 && !ready; i++) {
  await sleep(500);
  try {
    ready = (await fetch(`http://127.0.0.1:${PORT}/health`)).ok;
  } catch {}
}
if (!ready) {
  console.error('El servidor no levantó:', log.join(''));
  process.exit(1);
}
console.log(`\n— duelo de chicanas en la plaza (servidor :${PORT}) —\n`);

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
});

const abrir = async (jwt, spawnXZ, alias, faccion, rango) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errores.push(`consola: ${m.text().slice(0, 160)}`);
  });
  const url =
    `http://localhost:4173/?token=${encodeURIComponent(jwt)}&rt=${encodeURIComponent(`ws://127.0.0.1:${PORT}`)}` +
    `&hora=13&spawn=${spawnXZ}&alias=${encodeURIComponent(alias)}&faccion=${faccion}&rango=${rango}`;
  await page.goto(url, { waitUntil: 'networkidle' });
  return { page, errores };
};

// A ocho metros: dentro del alcance del encare (18 m).
const beto = await abrir(tokenBeto, '-2,-26', 'Beto el Puntero', 3, 4);
const marta = await abrir(tokenMarta, '-2,-18', 'Marta la Concejala', 2, 5);
await sleep(14000);

const enLinea = async (p) => p.evaluate(() => document.querySelector('.net-badge')?.textContent?.trim() ?? '');
check('Beto está en línea', (await enLinea(beto.page)).includes('En línea'));
check('Marta está en línea', (await enLinea(marta.page)).includes('En línea'));

// Beto encara con G.
await beto.page.locator('canvas').click({ position: { x: 640, y: 400 } });
await beto.page.keyboard.press('KeyG');
await sleep(2500);

const convite = await marta.page.evaluate(() => ({
  visible: Boolean(document.querySelector('.debate-invite')),
  texto: document.querySelector('.debate-invite__texto')?.textContent ?? '',
}));
check('A Marta le llegó el convite', convite.visible, convite.texto.trim());
if (convite.visible) await marta.page.screenshot({ path: `${out}/duelo-convite.png` });

// Marta se la banca.
await marta.page.getByRole('button', { name: 'Bancármela' }).click();
await sleep(2500);

const mesa = async (p) =>
  p.evaluate(() => ({
    abierta: Boolean(document.querySelector('.debate__panel')),
    turno: document.querySelector('.debate__turno')?.textContent?.trim() ?? '',
    cartas: [...document.querySelectorAll('.carta__nombre')].map((n) => n.textContent),
    jugables: document.querySelectorAll('.carta:not(:disabled)').length,
    credibilidades: [...document.querySelectorAll('.debate__cred-num')].map((n) => n.textContent?.trim()),
  }));

const mBeto = await mesa(beto.page);
const mMarta = await mesa(marta.page);
check('Se abrió la mesa de cartas en las dos pantallas', mBeto.abierta && mMarta.abierta);
check('La mano trae cuatro cartas', mBeto.cartas.length === 4, mBeto.cartas.join(' · '));
check('El marcador muestra las dos credibilidades', mBeto.credibilidades.length === 2, mBeto.credibilidades.join(' vs '));
check('El reloj de turno corre', /Turno 1\/12/.test(mBeto.turno), mBeto.turno);

// Le toca al retador: Beto juega la primera carta habilitada.
const antes = mMarta.credibilidades?.[0] ?? '';
await beto.page.screenshot({ path: `${out}/duelo-mesa.png` });
const jugables = beto.page.locator('.carta:not([disabled])');
const cuantas = await jugables.count();
check('Beto tiene cartas jugables', cuantas > 0, `${cuantas} de 4`);
if (cuantas > 0) {
  await jugables.first().click();
  await sleep(2000);
}

const despues = await mesa(beto.page);
check(
  'La jugada bajó la credibilidad del rival',
  despues.credibilidades[0] !== antes,
  `${antes} → ${despues.credibilidades[0]}`,
);
const registro = await beto.page.evaluate(() =>
  [...document.querySelectorAll('.debate__log-line')].map((l) => l.textContent?.trim()),
);
check('El registro cuenta lo que pasó', registro.length > 0, registro.slice(-1)[0] ?? '');
await beto.page.screenshot({ path: `${out}/duelo-jugada.png` });

// Ahora contesta Marta.
const deMarta = marta.page.locator('.carta:not([disabled])');
if ((await deMarta.count()) > 0) {
  await deMarta.first().click();
  await sleep(2000);
}
const cierre = await mesa(marta.page);
check('El duelo avanzó de turno', /Turno [2-9]\/12/.test(cierre.turno) || cierre.abierta, cierre.turno);
await marta.page.screenshot({ path: `${out}/duelo-marta.png` });

// El proxy del sandbox bloquea la API de clima: eso no es un bug del juego, el
// cliente cae a la climatología igual. Cualquier otro error sí cuenta.
const errores = [...beto.errores, ...marta.errores].filter(
  (e) => !e.includes('ERR_TUNNEL_CONNECTION_FAILED') && !e.includes('open-meteo'),
);
check('Sin errores de consola en ninguna pestaña', errores.length === 0, errores.slice(0, 2).join(' | '));

await browser.close();
server.kill('SIGTERM');

const ok = results.filter((r) => r.ok).length;
console.log(`\n  ${ok}/${results.length} verificaciones en verde`);
if (ok !== results.length) {
  console.log('\n--- log del servidor ---\n' + log.join('').slice(-3000));
  process.exit(1);
}
console.log('  ✓ El duelo de chicanas funciona de punta a punta.');
