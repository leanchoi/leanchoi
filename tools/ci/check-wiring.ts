/**
 * check-wiring — lo declarado tiene que estar conectado.
 *
 * Ejecutar:  npm run check:wiring
 *
 * Esta verificación existe porque una auditoría posterior a la Fase 4 encontró
 * tres cosas que ningún `typecheck` podía ver: mensajes de protocolo declarados
 * sin handler, un endpoint que el cliente llamaba y no existía, y —la peor— una
 * función de `/shared` escrita y testeada en la Fase 0 que nadie llamó nunca, y
 * que dejaba muerta la progresión de rangos entera.
 *
 * Un `typecheck` en verde no dice nada de una función que nadie usa. Esto sí.
 *
 * Verifica tres invariantes:
 *  1. Todo mensaje del protocolo tiene emisor y receptor.
 *  2. Toda ruta de la API que el cliente llama existe en `backend-php/api/`.
 *  3. Las funciones de `/shared` que sostienen reglas de juego tienen consumidor.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const raiz = new URL('../../', import.meta.url).pathname;
const errores: string[] = [];
const notas: string[] = [];

/** Concatena el texto de todos los `.ts`/`.tsx` de un árbol. */
const arbol = (relativo: string): string => {
  const base = join(raiz, relativo);
  if (!existsSync(base)) return '';
  let salida = '';
  const recorrer = (dir: string): void => {
    for (const entrada of readdirSync(dir)) {
      const ruta = join(dir, entrada);
      if (statSync(ruta).isDirectory()) recorrer(ruta);
      else if (/\.tsx?$/.test(entrada)) salida += readFileSync(ruta, 'utf8');
    }
  };
  recorrer(base);
  return salida;
};

const protocolo = readFileSync(join(raiz, 'shared/protocol/index.ts'), 'utf8');
const servidor = arbol('server-vps/src');
const cliente = arbol('client/src');
const compartido = arbol('shared');

/* 1. Protocolo: nada declarado sin usar ------------------------------------ */

const mensajes = [...protocolo.matchAll(/^\s+([A-Z_]+):\s*'(c2s|s2c)\./gm)].map((m) => ({
  nombre: m[1],
  lado: m[2].toUpperCase(),
}));

let vivos = 0;
for (const { nombre, lado } of mensajes) {
  const clave = `${lado}.${nombre}`;
  const enServidor = servidor.includes(clave);
  const enCliente = cliente.includes(clave);

  if (!enServidor && !enCliente) {
    errores.push(`protocolo: ${clave} está declarado y no lo usa nadie. Conectalo o sacalo.`);
  } else if (lado === 'C2S' && !enServidor) {
    errores.push(`protocolo: el cliente manda ${clave} y el servidor no lo maneja.`);
  } else if (lado === 'S2C' && !enCliente) {
    errores.push(`protocolo: el servidor emite ${clave} y el cliente lo ignora.`);
  } else {
    vivos++;
  }
}
notas.push(`Protocolo: ${vivos}/${mensajes.length} mensajes con emisor y receptor.`);

/* 2. Endpoints: lo que el cliente llama tiene que existir -------------------- */

/**
 * El prefijo de la API tiene que coincidir con dónde quedan los archivos.
 *
 * El paquete de despliegue copia `backend-php/api/` a `public_html/api/`, así
 * que la URL base del cliente termina en `/api` y nada más. Durante cuatro fases
 * el valor por defecto fue `/api/v1` —un prefijo que estaba en un documento de
 * diseño y nunca existió como carpeta ni como reescritura—, y eso significa 404
 * en absolutamente todas las llamadas: el primer despliegue no habría podido ni
 * loguear a nadie. El typecheck no ve esto; una constante mal puesta compila.
 */
const config = readFileSync(join(raiz, 'client/src/config.ts'), 'utf8');
const porDefecto = /baseUrl: str\('VITE_API_BASE_URL', '([^']+)'\)/.exec(config)?.[1];
if (!porDefecto) {
  errores.push('API: no se pudo leer el valor por defecto de VITE_API_BASE_URL en client/src/config.ts.');
} else {
  const prefijo = new URL(porDefecto).pathname.replace(/\/$/, '');
  if (prefijo !== '/api') {
    errores.push(
      `API: la URL base por defecto termina en "${prefijo}" y los archivos quedan en public_html/api/. ` +
        'Con ese prefijo todas las llamadas dan 404.',
    );
  } else {
    notas.push(`API: el prefijo por defecto ("${prefijo}") coincide con dónde quedan los archivos.`);
  }
}

// Sólo `CONFIG.api.baseUrl`, que es la API de Hostinger. `PrefabRegistry` tiene
// su propio `baseUrl` —el directorio de fachadas— y ése no es un endpoint.
const rutas = new Set(
  [...cliente.matchAll(/CONFIG\.api\.baseUrl\}(\/[a-zA-Z0-9/_.-]+)/g)].map((m) => m[1].split('?')[0]),
);
for (const ruta of rutas) {
  if (!existsSync(join(raiz, 'backend-php/api', ruta))) {
    errores.push(`API: el cliente llama a ${ruta} y no existe en backend-php/api/.`);
  }
}
notas.push(`API: ${rutas.size} ruta(s) llamadas desde el cliente, todas existentes.`);

/* 3. Reglas de juego de /shared con consumidor ------------------------------ */

/**
 * No toda función de `/shared` necesita consumidor —hay helpers que existen para
 * el contrato—, así que la lista es explícita: son las que **deciden** algo del
 * juego. Si una de éstas queda sin llamar, hay una mecánica muerta.
 *
 * Se busca el consumidor **en el servidor**, no en cualquier lado, y ésa es la
 * parte que importa. El bug que originó esta verificación era exactamente así:
 * `checkPromotion()` la llamaba el cliente para dibujar «te faltan 900 XP» y el
 * servidor no la llamaba nunca, así que el cartel decía la verdad sobre un
 * ascenso que no iba a ocurrir. Una regla consumida sólo por quien la muestra
 * está tan muerta como una que no consume nadie.
 */
const REGLAS_QUE_DEBEN_CORRER = [
  'checkPromotion',
  'computeQuestReward',
  'resolveCard',
  'computeFactionPresence',
  'evaluateControl',
  'projectSeats',
  'barrioHeatOf',
  // `isPublishable` no va en la lista: no la llama el servidor directamente sino
  // `barrioHeatOf` y `weightedShare`, que sí están acá. La compuerta de
  // k-anonimato queda cubierta por ellas.
] as const;

const consumidores = servidor;
for (const regla of REGLAS_QUE_DEBEN_CORRER) {
  // Se busca la llamada, no la mención: `checkPromotion(` y no el import.
  const llamada = new RegExp(`\\b${regla}\\s*\\(`);
  const declarada = new RegExp(`export const ${regla}\\b`).test(compartido);
  if (!declarada) {
    errores.push(`reglas: ${regla} figura en la lista y no existe en /shared. Actualizá la lista.`);
    continue;
  }
  if (!llamada.test(consumidores)) {
    errores.push(
      `reglas: ${regla}() está en /shared, testeada, y NO la llama nadie. Es una mecánica muerta.`,
    );
  }
}
notas.push(
  `Reglas de juego: ${REGLAS_QUE_DEBEN_CORRER.length} verificadas contra su consumidor en el servidor.`,
);

/* Salida -------------------------------------------------------------------- */

console.log('— check:wiring ———————————————————————————————');
for (const n of notas) console.log(`  · ${n}`);

if (errores.length > 0) {
  console.error('\n  FALLAS:');
  for (const e of errores) console.error(`   ✗ ${e}`);
  process.exit(1);
}
console.log('\n  ✓ Todo lo declarado está conectado.');
