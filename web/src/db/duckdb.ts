/**
 * Motor analítico en el navegador.
 *
 * El tablero no tiene backend: los Parquet que genera el ETL se descargan una
 * sola vez y se consultan con DuckDB-WASM, que corre SQL completo dentro de la
 * pestaña. Eso da dos cosas que un tablero servido por API no da gratis:
 * filtrado cruzado instantáneo (las agregaciones se recalculan en milisegundos,
 * sin viajes de red) y despliegue trivial (nginx sirviendo archivos estáticos).
 *
 * Los archivos se cargan como buffer en memoria en vez de por HTTP range: el
 * dataset completo es chico y así el tablero funciona en cualquier servidor
 * estático, sin depender de que soporte peticiones parciales.
 *
 * El formato es **Arrow IPC**, no Parquet, y es una decisión de despliegue:
 * `read_parquet` en DuckDB-WASM requiere una extensión que el motor descarga
 * desde `extensions.duckdb.org` en tiempo de ejecución. En una intranet sin
 * salida a internet —el escenario habitual de un organismo público— eso deja el
 * tablero en blanco. Arrow IPC lo ingiere el motor base, sin red ni extensiones.
 */

import * as duckdb from '@duckdb/duckdb-wasm';
import wasmMvp from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import workerMvp from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import wasmEh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import workerEh from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';

/** Tablas que publica el ETL, en el orden en que se registran. */
export const TABLAS = [
  'fact_establecimiento_dia',
  'fact_categoria_dia',
  'fact_dia',
  'fact_mes_quincena',
  'fact_mes',
  'dim_calendario',
  'dim_categoria',
  'dim_alojamiento',
  'dim_evento',
] as const;

export type Tabla = (typeof TABLAS)[number];

export interface ProgresoCarga {
  fase: 'motor' | 'datos' | 'vistas' | 'listo';
  detalle: string;
  progreso: number; // 0..1
}

let dbPromise: Promise<duckdb.AsyncDuckDB> | null = null;
let conexion: duckdb.AsyncDuckDBConnection | null = null;

const BASE = import.meta.env.BASE_URL || '/';

function rutaDato(archivo: string): string {
  return `${BASE.replace(/\/$/, '')}/data/${archivo}`;
}

async function crearMotor(): Promise<duckdb.AsyncDuckDB> {
  // Se ofrecen los dos bundles y DuckDB elige según lo que soporte el navegador:
  // `eh` (exception handling) es más rápido; `mvp` es el piso compatible.
  const bundles: duckdb.DuckDBBundles = {
    mvp: { mainModule: wasmMvp, mainWorker: workerMvp },
    eh: { mainModule: wasmEh, mainWorker: workerEh },
  };
  const elegido = await duckdb.selectBundle(bundles);
  if (!elegido.mainWorker) {
    throw new Error('DuckDB-WASM no pudo resolver un worker para este navegador.');
  }

  const worker = new Worker(elegido.mainWorker, { type: 'module' });
  const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
  await db.instantiate(elegido.mainModule, elegido.pthreadWorker);
  return db;
}

/**
 * Inicializa el motor, descarga los Parquet y crea una vista por tabla.
 * Es idempotente: llamadas concurrentes comparten la misma promesa.
 */
export function inicializar(onProgreso?: (p: ProgresoCarga) => void): Promise<duckdb.AsyncDuckDB> {
  if (dbPromise) return dbPromise;

  dbPromise = (async () => {
    onProgreso?.({ fase: 'motor', detalle: 'Iniciando motor analítico', progreso: 0.05 });
    const db = await crearMotor();

    onProgreso?.({ fase: 'datos', detalle: 'Descargando dataset', progreso: 0.2 });
    const descargas = await Promise.all(
      TABLAS.map(async (tabla, i) => {
        const url = rutaDato(`${tabla}.arrow`);
        const resp = await fetch(url);
        if (!resp.ok) {
          throw new Error(
            `No se pudo descargar ${tabla}.arrow (HTTP ${resp.status}). ` +
              `¿Corriste el ETL (make datos) y publicaste la carpeta data/ junto al sitio?`,
          );
        }
        const buffer = new Uint8Array(await resp.arrayBuffer());
        onProgreso?.({
          fase: 'datos',
          detalle: `Descargando dataset (${i + 1}/${TABLAS.length})`,
          progreso: 0.2 + (0.6 * (i + 1)) / TABLAS.length,
        });
        return { tabla, buffer };
      }),
    );

    onProgreso?.({ fase: 'vistas', detalle: 'Preparando el modelo', progreso: 0.85 });
    const con = await db.connect();
    for (const { tabla, buffer } of descargas) {
      await con.insertArrowFromIPCStream(buffer, { name: tabla, create: true });
    }
    conexion = con;

    onProgreso?.({ fase: 'listo', detalle: 'Listo', progreso: 1 });
    return db;
  })();

  // Un fallo no debe dejar la promesa cacheada: permite reintentar.
  dbPromise.catch(() => {
    dbPromise = null;
  });

  return dbPromise;
}

/** Normaliza los tipos que devuelve Arrow a primitivas de JS. */
function normalizarValor(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === 'bigint') return Number(v);
  // Arrow devuelve las fechas como number (ms) o Date según el tipo físico.
  if (v instanceof Date) return v;
  return v;
}

/** Ejecuta SQL y devuelve filas como objetos planos. */
export async function consultar<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  if (!conexion) {
    throw new Error('La base todavía no está inicializada. Llamá a inicializar() primero.');
  }
  let resultado;
  try {
    resultado = await conexion.query(sql);
  } catch (e) {
    // Un SQL roto sin el SQL en el mensaje es indepurable.
    throw new Error(`Error ejecutando la consulta.\n${(e as Error).message}\n\nSQL:\n${sql}`);
  }

  const filas: T[] = [];
  for (const fila of resultado.toArray()) {
    const obj = fila.toJSON() as Record<string, unknown>;
    const salida: Record<string, unknown> = {};
    for (const clave of Object.keys(obj)) salida[clave] = normalizarValor(obj[clave]);
    filas.push(salida as T);
  }
  return filas;
}

/** Devuelve la primera fila, o `null` si la consulta no trajo nada. */
export async function consultarUna<T = Record<string, unknown>>(sql: string): Promise<T | null> {
  const filas = await consultar<T>(sql);
  return filas.length ? filas[0] : null;
}

/** Metadatos del build del ETL. */
export interface Meta {
  generado: string;
  version_etl: string;
  origen: { descripcion: string; hash: string | null };
  destino: {
    nombre: string;
    provincia: string;
    pais: string;
    organismo: string;
    area: string;
    contacto: string;
  };
  periodo: { anio: number; desde: string; hasta: string; dias_con_relevamiento: number };
  parque: {
    establecimientos: number;
    categorias: number;
    uf_habilitadas_ult: number;
    pax_habilitadas_ult: number;
  };
  calidad: {
    registros: number;
    registros_relevados: number;
    tasa_respuesta_global: number;
    dias_publicables_oficial: number;
    dias_totales: number;
    tasa_dias_publicables: number;
    min_categorias_general: number;
    cobertura_por_categoria: Array<{
      categoria: string;
      dias: number;
      dias_con_dato: number;
      dias_publicables: number;
      tasa_publicable: number;
      n_establecimientos: number;
    }>;
    estados_sin_clasificar: Array<{ valor: string; n: number }>;
  };
  validacion: Record<string, unknown>;
  categorias: Array<{
    nombre: string;
    etiqueta: string;
    corta: string;
    grupo: string;
    orden: number;
    minimo_requerido: number;
  }>;
  orden_familia_estado: string[];
  parametros: {
    derrame: { habilitado: boolean; moneda: string; gasto_diario_por_turista: number; nota: string };
    metas: Record<string, number>;
    reglas: Record<string, number>;
  };
  tablas: Array<{ tabla: string; archivo: string; filas: number; bytes: number }>;
}

let metaCache: Meta | null = null;

export async function cargarMeta(): Promise<Meta> {
  if (metaCache) return metaCache;
  const resp = await fetch(rutaDato('meta.json'));
  if (!resp.ok) throw new Error(`No se pudo leer meta.json (HTTP ${resp.status}).`);
  metaCache = (await resp.json()) as Meta;
  return metaCache;
}
