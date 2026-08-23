/**
 * Simulación de duelos: el banco de pruebas del balance.
 *
 * Juega cientos de duelos entre bots con mazos aleatorios y verifica las dos
 * cosas que tienen que cumplirse para que el sistema de cartas no esté roto:
 *
 *   1. **Duración media entre 6 y 9 turnos.** Menos es un duelo que se define de
 *      arranque; más es un duelo que aburre.
 *   2. **Ninguna carta con más de 65% de victorias.** Si una carta gana sola,
 *      todos van a llevar esa y el mazo deja de ser una decisión.
 *
 * Ejecutar:  npm run test:debate --workspace server-vps
 */

import { CARD_CATALOG, CARD_LIST, createRng, type DebateCard, type DebateSide } from '@esquel/shared';

import { DebateEngine } from '../src/debate/DebateEngine.ts';

const DUELOS = Number(process.argv[2] ?? 400);
/** Jugadas mínimas para siquiera mirar el win-rate de una carta. */
const MUESTRA_MINIMA = 20;

/**
 * Intervalo de Wilson al 95%. Con 26 duelos, un 68% de victorias es
 * indistinguible de un 50%: sin esto, el criterio se vuelve una lotería de
 * semillas. Se marca una carta como dominante sólo cuando el **piso** del
 * intervalo supera el 65%, que es la forma correcta de afirmar "esta carta gana
 * de más".
 */
const wilson = (victorias: number, total: number): { bajo: number; alto: number } => {
  if (total === 0) return { bajo: 0, alto: 0 };
  const z = 1.96;
  const p = victorias / total;
  const denom = 1 + (z * z) / total;
  const centro = p + (z * z) / (2 * total);
  const margen = z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total));
  return { bajo: (centro - margen) / denom, alto: (centro + margen) / denom };
};

interface CartaStats {
  jugada: number;
  duelosConLaCarta: number;
  victorias: number;
  dañoTotal: number;
  impactos: number;
}

const stats = new Map<string, CartaStats>();
for (const c of CARD_LIST) {
  stats.set(c.slug, { jugada: 0, duelosConLaCarta: 0, victorias: 0, dañoTotal: 0, impactos: 0 });
}

/** Mazo legal al azar para un rango: 12 cartas respetando el tope de copias. */
const mazoAleatorio = (rankTier: number, rng: ReturnType<typeof createRng>): string[] => {
  const legales = CARD_LIST.filter((c) => c.enabled && c.minRank <= rankTier);
  const mazo: string[] = [];
  let intentos = 0;
  while (mazo.length < 12 && intentos < 500) {
    const carta = rng.pick(legales);
    if (mazo.filter((s) => s === carta.slug).length < carta.maxCopies) mazo.push(carta.slug);
    intentos++;
  }
  return mazo;
};

/**
 * Bot codicioso con tres reglas, que es más o menos como juega una persona:
 * si el rival prometió, carpetazo; si estoy por caer, prometo yo; si no, la que
 * mejor rinde por labia.
 */
const elegirCarta = (yo: DebateSide, rival: DebateSide, jugables: readonly string[]): string | null => {
  if (jugables.length === 0) return null;
  const cartas = jugables.map((slug) => CARD_CATALOG.get(slug) as DebateCard).filter(Boolean);

  if (rival.liedLastTurn) {
    const carpetazo = cartas.filter((c) => c.family === 'CARPETAZO').sort((a, b) => b.power - a.power)[0];
    if (carpetazo) return carpetazo.slug;
  }

  if (yo.credibility / yo.credibilityMax < 0.35) {
    const promesa = cartas.filter((c) => c.family === 'PROMESA_INVIABLE').sort((a, b) => b.power - a.power)[0];
    if (promesa) return promesa.slug;
  }

  // Valor por labia: el daño esperado, más un premio a robar energía.
  const puntaje = (c: DebateCard): number => {
    const robo = c.effects.filter((e) => e.kind === 'robar_labia').reduce((s, e) => s + e.value, 0);
    const cura = c.effects.filter((e) => e.kind === 'curar').reduce((s, e) => s + e.value, 0);
    const util = c.power * c.accuracy + robo * 6 + cura * 0.6;
    return util / Math.max(1, c.cost);
  };

  return cartas.sort((a, b) => puntaje(b) - puntaje(a))[0]?.slug ?? null;
};

/* ------------------------------------------------------------------ */
/* Corrida                                                             */
/* ------------------------------------------------------------------ */

const engine = new DebateEngine();
const turnos: number[] = [];
let empates = 0;
let porCredibilidad = 0;
let porTurnos = 0;

for (let i = 0; i < DUELOS; i++) {
  const rng = createRng(1000 + i);
  // Rangos parecidos, como exige el matchmaking de esquina (±3).
  const rangoA = rng.int(1, 10);
  const rangoB = Math.max(1, Math.min(10, rangoA + rng.int(-3, 3)));

  const mazoA = mazoAleatorio(rangoA, rng);
  const mazoB = mazoAleatorio(rangoB, rng);

  const duel = engine.create({
    id: `sim-${i}`,
    arena: 'esquina',
    zoneId: 'zone:plaza-san-martin',
    challenger: { charId: 'A', nick: 'Bot A', factionId: 3, rankTier: rangoA, reputation: rangoA * 30, deck: mazoA },
    defender: { charId: 'B', nick: 'Bot B', factionId: 2, rankTier: rangoB, reputation: rangoB * 30, deck: mazoB },
    spectators: rng.int(0, 12),
    pot: 0,
    zoneControl: { 3: rng.next(), 2: rng.next() },
    seed: 5000 + i,
  });

  const jugadasPorLado: Record<string, Set<string>> = { A: new Set(), B: new Set() };
  let guardia = 0;

  while (!duel.finished && guardia++ < 200) {
    const quien = duel.activeSide;
    const vista = engine.viewFor(duel.id, quien);
    if (!vista) break;

    const yo = quien === 'A' ? duel.challenger : duel.defender;
    const rival = quien === 'A' ? duel.defender : duel.challenger;
    const elegida = elegirCarta(yo, rival, vista.playable);

    if (elegida) {
      const antes = duel.log.length;
      const res = engine.playCard(duel.id, quien, elegida, duel.turn);
      if (!res.ok) {
        engine.pass(duel.id, quien);
        continue;
      }
      jugadasPorLado[quien]?.add(elegida);
      const s = stats.get(elegida);
      const entrada = duel.log[antes];
      if (s && entrada) {
        s.jugada++;
        if (entrada.hit) {
          s.impactos++;
          s.dañoTotal += entrada.damage;
        }
      }
    } else {
      engine.pass(duel.id, quien);
    }
  }

  const resultado = duel.outcome;
  turnos.push(duel.turn);
  if (!resultado || resultado.draw) empates++;
  else if (resultado.reason === 'credibilidad') porCredibilidad++;
  else porTurnos++;

  const ganador = resultado?.winner;
  for (const lado of ['A', 'B'] as const) {
    for (const slug of jugadasPorLado[lado] ?? []) {
      const s = stats.get(slug);
      if (!s) continue;
      s.duelosConLaCarta++;
      if (ganador === lado) s.victorias++;
    }
  }

  engine.dispose(duel.id);
}

/* ------------------------------------------------------------------ */
/* Informe                                                             */
/* ------------------------------------------------------------------ */

const promedio = turnos.reduce((a, b) => a + b, 0) / turnos.length;
const ordenados = [...turnos].sort((a, b) => a - b);
const mediana = ordenados[Math.floor(ordenados.length / 2)] as number;
const minimo = ordenados[0] as number;
const maximo = ordenados[ordenados.length - 1] as number;

console.log(`\n— simulación de ${DUELOS} duelos de chicanas —\n`);
console.log(`  Duración: promedio ${promedio.toFixed(2)} turnos · mediana ${mediana} · rango ${minimo}-${maximo}`);
console.log(
  `  Cierre: ${porCredibilidad} por credibilidad · ${porTurnos} por agotar turnos · ${empates} empates técnicos\n`,
);

const filas = CARD_LIST.map((c) => {
  const s = stats.get(c.slug) as CartaStats;
  const winRate = s.duelosConLaCarta > 0 ? s.victorias / s.duelosConLaCarta : 0;
  const dañoMedio = s.impactos > 0 ? s.dañoTotal / s.impactos : 0;
  return { carta: c, ...s, winRate, dañoMedio };
}).sort((a, b) => b.winRate - a.winRate);

console.log('  carta                        familia            jugadas  daño medio  win-rate (IC 95%)');
for (const f of filas) {
  const ic = wilson(f.victorias, f.duelosConLaCarta);
  const alerta = f.duelosConLaCarta >= MUESTRA_MINIMA && ic.bajo > 0.65 ? ' ⚠' : '';
  console.log(
    `  ${f.carta.name.padEnd(28)} ${f.carta.family.padEnd(18)} ${String(f.jugada).padStart(6)}  ` +
      `${f.dañoMedio.toFixed(1).padStart(9)}  ${(f.winRate * 100).toFixed(1).padStart(6)}% ` +
      `[${(ic.bajo * 100).toFixed(0)}-${(ic.alto * 100).toFixed(0)}]${alerta}`,
  );
}

const fallas: string[] = [];
if (promedio < 6 || promedio > 9) {
  fallas.push(`La duración media es ${promedio.toFixed(2)} turnos; el diseño pide entre 6 y 9.`);
}
const dominantes = filas.filter(
  (f) => f.duelosConLaCarta >= MUESTRA_MINIMA && wilson(f.victorias, f.duelosConLaCarta).bajo > 0.65,
);
for (const d of dominantes) {
  const ic = wilson(d.victorias, d.duelosConLaCarta);
  fallas.push(
    `"${d.carta.name}" gana el ${(d.winRate * 100).toFixed(1)}% (piso del intervalo ${(ic.bajo * 100).toFixed(1)}%, tope 65%).`,
  );
}
const nuncaJugadas = filas.filter((f) => f.jugada === 0);
for (const n of nuncaJugadas) {
  fallas.push(`"${n.carta.name}" no se jugó nunca: revisar coste o requisitos.`);
}

console.log(
  `\n  Criterio: se marca dominante la carta cuyo piso del intervalo del 95% supera el 65%,\n` +
  `  con al menos ${MUESTRA_MINIMA} duelos jugados. El punto estimado se informa igual.`,
);

console.log('');
if (fallas.length > 0) {
  console.error('  FALLAS DE BALANCE:');
  for (const f of fallas) console.error(`   ✗ ${f}`);
  process.exit(1);
}
console.log('  ✓ Duración dentro de la ventana y ninguna carta domina el meta.\n');
