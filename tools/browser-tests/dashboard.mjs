/**
 * Capturas del Dashboard de Campaña con datos sintéticos.
 *
 * El backend PHP necesita MySQL, que en este entorno no hay, así que se
 * interceptan las tres llamadas de red y se devuelve un `DashboardSnapshot`
 * armado a mano con la forma exacta del contrato. Lo que se verifica acá es el
 * **render**: que los gráficos dibujen bien, que las etiquetas no se pisen y que
 * el k-anonimato se vea como corresponde.
 */
import { chromium } from 'playwright';

const out = process.argv[2];
const base = process.argv[3] ?? 'http://localhost:4173';

const barrios = [
  ['centro', 1, 0.31, 0.98, 0.12, 240],
  ['badenes', 3, 0.22, 0.71, -0.34, 118],
  ['ceferino', 3, 0.18, 0.64, -0.21, 96],
  ['bella_vista', 2, 0.27, 0.42, 0.31, 74],
  ['don_bosco', 2, 0.11, 0.38, 0.05, 61],
  ['estacion', 5, 0.35, 0.55, 0.18, 52],
  ['zona_norte', 1, 0.09, 0.29, -0.08, 44],
  ['alta_esquel', 4, 0.24, 0.33, 0.22, 38],
  ['plan_1000', 3, 0.4, 0.47, -0.52, 33],
  ['valle_chico', 2, 0.15, 0.12, 0.02, 19],
  ['matadero', 4, 0.19, 0.21, -0.11, 16],
  ['villa_ayelen', 1, 0.05, 0.08, 0.4, 9],
  ['alto_rio_percy', 0, 0, 0.03, 0, 4],
].map(([barrio, faccion, margen, mil, humor, n]) => ({
  barrio,
  dominantFaction: n >= 15 && faccion ? faccion : null,
  dominanceMargin: n >= 15 ? margen : 0,
  militancy: n >= 15 ? mil : 0,
  mood: n >= 15 ? humor : 0,
  subjects: n,
  publishable: n >= 15,
}));

const listas = [
  [1, 0.311, 1.4, 4],
  [3, 0.264, -0.9, 3],
  [2, 0.219, 0.6, 2],
  [5, 0.121, -0.3, 1],
  [4, 0.085, -0.8, 1],
].map(([factionId, share, deltaPp, seats]) => ({
  factionId,
  share,
  deltaPp,
  moe: 0.031,
  seats,
  n: 804,
}));

const dias = Array.from({ length: 9 }, (_, i) => {
  const d = new Date(Date.UTC(2027, 3, 7 + i)).toISOString().slice(0, 10);
  const ruido = (k) => 0.02 * Math.sin((i + k) * 0.9);
  return {
    day: d,
    byFaction: {
      1: 0.29 + i * 0.003 + ruido(0),
      3: 0.28 - i * 0.002 + ruido(2),
      2: 0.21 + ruido(4),
      5: 0.13 + ruido(6),
      4: 0.09 + ruido(1),
    },
    undecided: 0.19 - i * 0.004,
  };
});

const snapshot = {
  day: '2027-04-15',
  generatedAt: '2027-04-15T18:00:00Z',
  heat: { day: '2027-04-15', generatedAt: '2027-04-15T18:00:00Z', barrios, windowDays: 7 },
  projection: {
    day: '2027-04-15',
    generatedAt: '2027-04-15T18:00:00Z',
    mayor: listas,
    council: listas,
    undecidedShare: 0.161,
    sampleSize: 804,
    publishable: true,
  },
  trend: dias,
  participation: [
    { questType: 'PEGATINA_RELAMPAGO', starts: 412, finishes: 331, completionAvg: 0.82 },
    { questType: 'BANDERAZO_CALLEJERO', starts: 190, finishes: 121, completionAvg: 0.64 },
    { questType: 'REPARTO_BARRIAL', starts: 155, finishes: 140, completionAvg: 0.91 },
  ],
  sponsors: [
    { sponsorId: 1, name: 'Chocolatería del Centro', impressions: 1840, uniqueSubjects: 412, entries: 331, buffClaims: 218 },
    { sponsorId: 2, name: 'Café de la Estación', impressions: 1260, uniqueSubjects: 288, entries: 241, buffClaims: 190 },
    { sponsorId: 3, name: 'Indumentaria Cordillerana', impressions: 640, uniqueSubjects: 171, entries: 88, buffClaims: 34 },
  ],
  live: { online: 47, shards: 1 },
  kAnonMin: 15,
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const errores = [];
page.on('pageerror', (e) => errores.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errores.push(`consola: ${m.text().slice(0, 200)}`);
});

// Se interceptan las tres llamadas: login, métricas y foto en vivo.
await page.route('**/admin/login.php', (route) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      token: 'token-de-prueba',
      alias: 'Antigravity',
      role: 'admin',
      expiresIn: 28800,
      realtimeEndpoint: 'ws://127.0.0.1:1',
    }),
  }),
);
await page.route('**/intelligence/metrics.php*', (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(snapshot) }),
);
await page.route('**/intel/live', (route) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, shards: 1, online: 47, rooms: [] }),
  }),
);

const check = [];
const ok = (nombre, cond, detalle = '') => {
  check.push(cond);
  console.log(`  ${cond ? '✓' : '✗'} ${nombre}${detalle ? ` — ${detalle}` : ''}`);
};

await page.goto(`${base}/admin`, { waitUntil: 'networkidle' });
await page.waitForSelector('.admin-login', { timeout: 15000 });
await page.screenshot({ path: `${out}/admin-login.png` });
ok('La puerta del panel se abre', true);

await page.getByRole('button', { name: 'Clave maestra' }).click();
await page.locator('.admin-field input[type="password"]').fill('la-que-sea');
await page.getByRole('button', { name: 'Entrar' }).click();
await page.waitForSelector('.admin-heat__svg', { timeout: 15000 });
await page.waitForTimeout(600);

const celdas = await page.locator('.admin-heat__cell').count();
ok('El mapa dibuja los trece barrios', celdas === 13, `${celdas} celdas`);
await page.screenshot({ path: `${out}/admin-mapa.png` });

// El barrio sin muestra tiene que verse rayado, no en cero.
const rayado = await page.locator('rect[fill="url(#sinDatos)"]').count();
ok('Los barrios sin muestra van rayados', rayado >= 1, `${rayado} sin datos`);

await page.locator('.admin-heat__cell').first().hover();
await page.waitForTimeout(250);
const detalle = await page.locator('.admin-heat__detail').innerText();
ok('El detalle del barrio responde al mouse', detalle.length > 20, detalle.split('\n')[0]);

await page.getByRole('button', { name: 'Dónde se milita' }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/admin-militancia.png` });

await page.getByRole('button', { name: 'Proyección 2027' }).click();
await page.waitForSelector('.admin-bars', { timeout: 8000 });
await page.waitForTimeout(400);
const bancas = await page.locator('.admin-seats__box').count();
ok('Se reparten las once bancas', bancas === 11, `${bancas} cuadraditos`);
await page.screenshot({ path: `${out}/admin-proyeccion.png` });

// La tendencia responde al mouse.
await page.locator('.admin-trend').hover({ position: { x: 400, y: 100 } });
await page.waitForTimeout(250);
const tooltip = await page.locator('.admin-trend__tooltip').count();
ok('La tendencia muestra el corte del día bajo el mouse', tooltip === 1);
await page.screenshot({ path: `${out}/admin-tendencia.png` });

await page.getByRole('button', { name: 'Consola Live-Ops' }).click();
await page.waitForSelector('.admin-liveops', { timeout: 8000 });
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/admin-liveops.png` });
ok('La consola Live-Ops se monta', true);

await page.getByRole('button', { name: 'Auspicios' }).click();
await page.waitForTimeout(300);
const filas = await page.locator('.admin-tabla__plana tbody tr').count();
ok('Los tres comercios aparecen con sus métricas', filas === 3, `${filas} filas`);
await page.screenshot({ path: `${out}/admin-auspicios.png` });

ok('Sin errores de consola', errores.length === 0, errores.slice(0, 2).join(' | '));

await browser.close();
const verdes = check.filter(Boolean).length;
console.log(`\n  ${verdes}/${check.length} verificaciones en verde`);
if (verdes !== check.length) process.exit(1);
