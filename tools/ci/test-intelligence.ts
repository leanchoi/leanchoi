/**
 * test:intelligence — verifica las cuentas del Motor de Inteligencia.
 *
 * Ejecutar:  npm run test:intelligence
 *
 * Son las cuentas que sostienen el dashboard: si el reparto de bancas o el
 * margen de error están mal, el número que un candidato ve en pantalla es
 * mentira. Se verifican contra ejemplos canónicos calculados a mano, no contra
 * la salida de la propia implementación.
 */

import {
  barrioHeatOf,
  dHondt,
  isPublishable,
  marginOfError,
  projectSeats,
  redactMatrix,
  toCsv,
  weightedShare,
} from '../../shared/util/intelligence.ts';
import { ageGroupOf, CONCEJO_SEATS } from '../../shared/types/intelligence.ts';
import { AGE_BANDS, BARRIOS, type FactionId } from '../../shared/types/common.ts';
import { execFileSync } from 'node:child_process';
import { K_ANON_MIN } from '../../shared/types/telemetry.ts';

let fallas = 0;
const eq = (nombre: string, a: unknown, b: unknown): void => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  console.log(`  ${ok ? '✓' : '✗'} ${nombre}${ok ? '' : ` — esperado ${JSON.stringify(b)}, salió ${JSON.stringify(a)}`}`);
  if (!ok) fallas++;
};

console.log('— test:intelligence ——————————————————————————');

/* 1. D'Hondt contra ejemplos calculados a mano ------------------------------ */
// Cocientes: 100, 80, 50, 40, 33,3, 30, 26,7, 25 → A=4, B=3, C=1, D=0.
eq('D\'Hondt 100/80/30/20 en 8 bancas', dHondt({ 1: 100, 2: 80, 3: 30, 4: 20 }, 8, 0), { 1: 4, 2: 3, 3: 1, 4: 0 });
// Cocientes: 340, 280, 170, 160, 140, 113,3, 93,3 → A=3, B=3, C=1, D=0.
eq('D\'Hondt 340/280/160/60 en 7 bancas', dHondt({ 1: 340, 2: 280, 3: 160, 4: 60 }, 7, 0), { 1: 3, 2: 3, 3: 1, 4: 0 });
eq('el piso del 3% deja afuera al 2%', dHondt({ 1: 500, 2: 480, 3: 20 }, 5, 0.03), { 1: 3, 2: 2, 3: 0 });
eq('un empate se resuelve por id, siempre igual', dHondt({ 7: 100, 3: 100 }, 1, 0), { 7: 0, 3: 1 });
eq('y da lo mismo con las claves al revés', dHondt({ 3: 100, 7: 100 }, 1, 0), { 3: 1, 7: 0 });

const reparto = dHondt({ 1: 3210, 2: 2980, 3: 1870, 4: 1440, 5: 500 }, CONCEJO_SEATS, 0.03);
eq(`se reparten las ${CONCEJO_SEATS} bancas del Concejo`, Object.values(reparto).reduce((a, b) => a + b, 0), CONCEJO_SEATS);
console.log(`    reparto de ${CONCEJO_SEATS} bancas: ${JSON.stringify(reparto)}`);

/* 2. Proyección completa ---------------------------------------------------- */
const proyeccion = projectSeats([
  { factionId: 1 as FactionId, share: 0.34, n: 420, deltaPp: 1.2 },
  { factionId: 2 as FactionId, share: 0.29, n: 380, deltaPp: -0.8 },
  { factionId: 3 as FactionId, share: 0.21, n: 260, deltaPp: 0.4 },
  { factionId: 4 as FactionId, share: 0.16, n: 190, deltaPp: -0.9 },
]);
eq('la proyección viene ordenada de mayor a menor', proyeccion.map((p) => p.factionId), [1, 2, 3, 4]);
eq('reparte exactamente las bancas disponibles', proyeccion.reduce((s, p) => s + p.seats, 0), CONCEJO_SEATS);
eq('el ganador no se queda sin bancas', proyeccion[0].seats > 0, true);
console.log(`    proyección: ${proyeccion.map((p) => `f${p.factionId} ${(p.share * 100).toFixed(1)}% → ${p.seats}`).join(' · ')}`);

/* 3. Margen de error -------------------------------------------------------- */
const m100 = marginOfError(0.5, 100);
const m1000 = marginOfError(0.5, 1000);
console.log(`    moe(p=0,5): n=100 → ±${(m100 * 100).toFixed(1)} pp · n=1000 → ±${(m1000 * 100).toFixed(1)} pp`);
eq('n=100 rinde el ±9,8 pp de manual', Math.abs(m100 - 0.098) < 0.002, true);
eq('más muestra, menos error', m1000 < m100, true);
eq('con la muestra igual al padrón el error se desploma', marginOfError(0.5, 30_000, 30_000) < 0.012, true);

/* 4. k-anonimato ------------------------------------------------------------ */
eq(`por debajo de ${K_ANON_MIN} no se publica`, isPublishable(K_ANON_MIN - 1), false);
eq(`justo en ${K_ANON_MIN} sí`, isPublishable(K_ANON_MIN), true);
const redactada = redactMatrix([
  { barrio: 'centro', ageGroup: '25-39', gender: 'femenino', n: 40, value: 0.62, moe: 0.05, publishable: true },
  { barrio: 'valle_chico', ageGroup: '60+', gender: 'masculino', n: 4, value: 0.91, moe: 0.4, publishable: true },
]);
eq('la celda chica sale sin valor', redactada[1].value, 0);
eq('pero conserva el conteo, para saber cuánto falta', redactada[1].n, 4);
eq('y queda marcada como no publicable', redactada[1].publishable, false);

/* 5. Ponderación por padrón ------------------------------------------------- */
const soloCentro = weightedShare({ centro: { share: 0.8, n: 40 } });
const conBaden = weightedShare({ centro: { share: 0.8, n: 40 }, badenes: { share: 0.2, n: 40 } });
console.log(
  `    ponderado: sólo Centro ${soloCentro.share.toFixed(3)} (cobertura ${(soloCentro.coverage * 100).toFixed(0)}% del padrón) · con Badén ${conBaden.share.toFixed(3)}`,
);
eq('un barrio en contra baja el share ponderado', conBaden.share < soloCentro.share, true);
eq('la cobertura crece al sumar barrios', conBaden.coverage > soloCentro.coverage, true);
eq('una celda por debajo de k no aporta nada', weightedShare({ centro: { share: 0.9, n: 3 } }).subjects, 0);

/* 6. Temperatura del barrio ------------------------------------------------- */
const caliente = barrioHeatOf(
  { barrio: 'badenes', votes: { 1: 60, 2: 30, 3: 10 }, activity: 800, moodSum: -12, moodCount: 40, subjects: 100 },
  1000,
);
eq('el dominante es el más votado', caliente.dominantFaction, 1);
eq('la militancia se normaliza contra el barrio más movido', caliente.militancy, 0.8);
eq('el humor es el promedio declarado', caliente.mood, -0.3);
const frio = barrioHeatOf(
  { barrio: 'valle_chico', votes: { 1: 3 }, activity: 10, moodSum: 2, moodCount: 3, subjects: 3 },
  1000,
);
eq('un barrio sin gente no tiene dominante', frio.dominantFaction, null);
eq('ni militancia inventada', frio.militancy, 0);

/* 7. Franjas de reporte ----------------------------------------------------- */
eq('las seis bandas caen en las cuatro franjas', [...new Set(AGE_BANDS.map(ageGroupOf))].length, 4);
eq('los pibes de 16 y los de 24 van juntos', [ageGroupOf('16-17'), ageGroupOf('18-24')], ['16-24', '16-24']);
eq('65+ es la franja de arriba', ageGroupOf('65+'), '60+');

/* 8. CSV -------------------------------------------------------------------- */
eq(
  'el CSV escapa comillas y comas',
  toCsv([{ a: 'dijo "no", y se fue', b: 2 }], ['a', 'b']),
  'a,b\n"dijo ""no"", y se fue",2\n',
);
eq('sin filas, queda el encabezado solo', toCsv([], ['a', 'b']), 'a,b\n');

/* 9. Paridad con PHP -------------------------------------------------------- */
// El dashboard muestra el número que calcula PHP; el motor del VPS proyecta con
// el de TypeScript. Si divergen, un candidato ve dos bancas distintas según
// dónde mire. Se comparan las dos implementaciones, no una contra sí misma.
const php = (args: readonly string[]): string => {
  const cli = new URL('../../backend-php/tests/intel-cli.php', import.meta.url).pathname;
  return execFileSync('php', [cli, ...args], { encoding: 'utf8' }).trim();
};

let phpDisponible = true;
try {
  execFileSync('php', ['--version'], { stdio: 'ignore' });
} catch {
  phpDisponible = false;
  console.log('  · PHP no está en este entorno: se saltea la paridad con el backend.');
}

if (phpDisponible) {
  const casos: readonly { shares: Record<number, number>; seats: number; nombre: string }[] = [
    { nombre: 'cuatro listas parejas', shares: { 1: 0.34, 2: 0.29, 3: 0.21, 4: 0.16 }, seats: 11 },
    { nombre: 'una lista arrasa', shares: { 1: 0.71, 2: 0.19, 3: 0.1 }, seats: 11 },
    { nombre: 'con una lista bajo el piso', shares: { 1: 0.5, 2: 0.48, 3: 0.02 }, seats: 11 },
    { nombre: 'empate exacto', shares: { 1: 0.5, 2: 0.5 }, seats: 7 },
  ];

  for (const caso of casos) {
    const enTs = dHondt(
      Object.fromEntries(Object.entries(caso.shares).map(([k, v]) => [k, Math.round(v * 10_000)])),
      caso.seats,
      0.03,
    );
    const enPhp = JSON.parse(php(['dhondt', JSON.stringify(caso.shares), String(caso.seats), '0.03'])) as Record<string, number>;
    const normalizado = Object.fromEntries(Object.entries(enPhp).map(([k, v]) => [Number(k), v]));
    eq(`D'Hondt PHP ⇄ TS: ${caso.nombre}`, normalizado, enTs);
  }

  const moePhp = Number(php(['moe', '0.5', '100']));
  eq('margen de error PHP ⇄ TS', Math.abs(moePhp - marginOfError(0.5, 100)) < 1e-6, true);

  for (const banda of AGE_BANDS) {
    eq(`franja de reporte de ${banda} en PHP`, php(['agegroup', banda]), ageGroupOf(banda));
  }

  const kanon = JSON.parse(php(['kanon', String(K_ANON_MIN)])) as { kAnonMin: number; publishable: boolean };
  eq('el umbral de k-anonimato coincide', kanon.kAnonMin, K_ANON_MIN);
  eq('y la compuerta también', kanon.publishable, isPublishable(K_ANON_MIN));

  const barriosPhp = JSON.parse(php(['barrios'])) as string[];
  eq('la lista de barrios coincide', barriosPhp, [...BARRIOS]);
}

/* Salida -------------------------------------------------------------------- */
if (fallas > 0) {
  console.error(`\n  ${fallas} falla(s) en el Motor de Inteligencia.`);
  process.exit(1);
}
console.log('\n  ✓ Bancas, error muestral, k-anonimato, ponderación y export verificados.');
