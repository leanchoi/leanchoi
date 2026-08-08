/**
 * Estado de filtrado cruzado.
 *
 * Un único objeto `Filtros` gobierna todos los gráficos del tablero: cualquier
 * marca sobre la que se pueda hacer clic (una barra de categoría, un día del
 * calendario, un día de la semana, un mes) escribe acá, y todo lo demás se
 * recalcula contra el mismo recorte. Eso es lo que hace que el tablero se sienta
 * reactivo: no hay filtros por gráfico, hay un solo estado compartido.
 *
 * `aSql()` traduce ese estado a predicados SQL. Devuelve por separado el
 * predicado de calendario y el de categoría porque algunos gráficos necesitan
 * ignorar su propia dimensión: el ranking de categorías, por ejemplo, se
 * calcula sin filtrar por categoría, de modo que al seleccionar una las demás
 * sigan visibles (atenuadas) en vez de desaparecer.
 */

export type TipoDia = 'todos' | 'finde' | 'feriado' | 'laborable' | 'no_laborable';
export type Publicables = 'todos' | 'publicables';

export interface Filtros {
  desde: string | null; // ISO yyyy-mm-dd
  hasta: string | null;
  meses: number[];
  categorias: string[];
  quincenas: number[];
  dow: number[]; // 0 = lunes
  temporadas: string[];
  eventos: string[];
  tipoDia: TipoDia;
  publicables: Publicables;
}

export const FILTROS_VACIOS: Filtros = {
  desde: null,
  hasta: null,
  meses: [],
  categorias: [],
  quincenas: [],
  dow: [],
  temporadas: [],
  eventos: [],
  tipoDia: 'todos',
  publicables: 'todos',
};

// --------------------------------------------------------------------------
// Acciones
// --------------------------------------------------------------------------
export type AccionFiltro =
  | { tipo: 'reiniciar' }
  | { tipo: 'rango'; desde: string | null; hasta: string | null }
  | { tipo: 'alternarMes'; mes: number }
  | { tipo: 'alternarCategoria'; categoria: string }
  | { tipo: 'alternarQuincena'; quincena: number }
  | { tipo: 'alternarDow'; dow: number }
  | { tipo: 'alternarTemporada'; temporada: string }
  | { tipo: 'alternarEvento'; evento: string }
  | { tipo: 'tipoDia'; valor: TipoDia }
  | { tipo: 'publicables'; valor: Publicables }
  | { tipo: 'quitar'; clave: keyof Filtros; valor?: string | number };

function alternar<T>(lista: T[], valor: T): T[] {
  return lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor];
}

export function reducer(estado: Filtros, accion: AccionFiltro): Filtros {
  switch (accion.tipo) {
    case 'reiniciar':
      return FILTROS_VACIOS;
    case 'rango':
      return { ...estado, desde: accion.desde, hasta: accion.hasta };
    case 'alternarMes':
      return { ...estado, meses: alternar(estado.meses, accion.mes) };
    case 'alternarCategoria':
      return { ...estado, categorias: alternar(estado.categorias, accion.categoria) };
    case 'alternarQuincena':
      return { ...estado, quincenas: alternar(estado.quincenas, accion.quincena) };
    case 'alternarDow':
      return { ...estado, dow: alternar(estado.dow, accion.dow) };
    case 'alternarTemporada':
      return { ...estado, temporadas: alternar(estado.temporadas, accion.temporada) };
    case 'alternarEvento':
      return { ...estado, eventos: alternar(estado.eventos, accion.evento) };
    case 'tipoDia':
      return { ...estado, tipoDia: accion.valor };
    case 'publicables':
      return { ...estado, publicables: accion.valor };
    case 'quitar': {
      const { clave, valor } = accion;
      const actual = estado[clave];
      if (Array.isArray(actual)) {
        return { ...estado, [clave]: actual.filter((v) => v !== valor) } as Filtros;
      }
      if (clave === 'desde' || clave === 'hasta') return { ...estado, desde: null, hasta: null };
      if (clave === 'tipoDia') return { ...estado, tipoDia: 'todos' };
      if (clave === 'publicables') return { ...estado, publicables: 'todos' };
      return estado;
    }
    default:
      return estado;
  }
}

// --------------------------------------------------------------------------
// Traducción a SQL
// --------------------------------------------------------------------------
function lista(valores: (string | number)[]): string {
  return valores
    .map((v) => (typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`))
    .join(', ');
}

export interface PredicadosSql {
  /** Condiciones sobre dim_calendario (alias `cal`). */
  calendario: string;
  /** Condición sobre la categoría (columna `categoria` de la tabla consultada). */
  categoria: string;
  /** Calendario + categoría. */
  todo: string;
  hayFiltros: boolean;
}

export function aSql(f: Filtros, aliasCal = 'cal', columnaCategoria = 'categoria'): PredicadosSql {
  const cal: string[] = [];

  if (f.desde) cal.push(`${aliasCal}.fecha >= DATE '${f.desde}'`);
  if (f.hasta) cal.push(`${aliasCal}.fecha <= DATE '${f.hasta}'`);
  if (f.meses.length) cal.push(`${aliasCal}.mes IN (${lista(f.meses)})`);
  if (f.quincenas.length) cal.push(`${aliasCal}.quincena IN (${lista(f.quincenas)})`);
  if (f.dow.length) cal.push(`${aliasCal}.dow IN (${lista(f.dow)})`);
  if (f.temporadas.length) cal.push(`${aliasCal}.temporada IN (${lista(f.temporadas)})`);
  if (f.eventos.length) cal.push(`${aliasCal}.evento_nombre IN (${lista(f.eventos)})`);

  switch (f.tipoDia) {
    case 'finde':
      cal.push(`${aliasCal}.es_finde`);
      break;
    case 'feriado':
      cal.push(`${aliasCal}.es_feriado`);
      break;
    case 'no_laborable':
      cal.push(`${aliasCal}.es_no_laborable`);
      break;
    case 'laborable':
      cal.push(`NOT ${aliasCal}.es_no_laborable`);
      break;
    default:
      break;
  }

  const categoria = f.categorias.length ? `${columnaCategoria} IN (${lista(f.categorias)})` : '';

  const calendario = cal.length ? cal.join(' AND ') : 'TRUE';
  const partes = [calendario !== 'TRUE' ? calendario : '', categoria].filter(Boolean);

  return {
    calendario,
    categoria: categoria || 'TRUE',
    todo: partes.length ? partes.join(' AND ') : 'TRUE',
    hayFiltros: contarFiltros(f) > 0,
  };
}

export function contarFiltros(f: Filtros): number {
  return (
    (f.desde || f.hasta ? 1 : 0) +
    f.meses.length +
    f.categorias.length +
    f.quincenas.length +
    f.dow.length +
    f.temporadas.length +
    f.eventos.length +
    (f.tipoDia !== 'todos' ? 1 : 0) +
    (f.publicables !== 'todos' ? 1 : 0)
  );
}

/** Descripción legible de cada filtro activo, para los chips de la barra. */
export interface Chip {
  clave: keyof Filtros;
  valor?: string | number;
  etiqueta: string;
  grupo: string;
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const TIPO_DIA_ETIQUETA: Record<TipoDia, string> = {
  todos: '',
  finde: 'Solo fines de semana',
  feriado: 'Solo feriados',
  laborable: 'Solo días hábiles',
  no_laborable: 'Findes y feriados',
};

export function chips(f: Filtros, etiquetaCategoria: (c: string) => string): Chip[] {
  const out: Chip[] = [];

  if (f.desde || f.hasta) {
    const desde = f.desde ? formatearFecha(f.desde) : 'inicio';
    const hasta = f.hasta ? formatearFecha(f.hasta) : 'hoy';
    out.push({ clave: 'desde', etiqueta: `${desde} → ${hasta}`, grupo: 'Período' });
  }
  for (const m of f.meses) out.push({ clave: 'meses', valor: m, etiqueta: MESES[m - 1], grupo: 'Mes' });
  for (const q of f.quincenas)
    out.push({ clave: 'quincenas', valor: q, etiqueta: `${q}ª quincena`, grupo: 'Quincena' });
  for (const d of f.dow) out.push({ clave: 'dow', valor: d, etiqueta: DIAS[d], grupo: 'Día' });
  for (const c of f.categorias)
    out.push({ clave: 'categorias', valor: c, etiqueta: etiquetaCategoria(c), grupo: 'Categoría' });
  for (const t of f.temporadas)
    out.push({ clave: 'temporadas', valor: t, etiqueta: `Temporada ${t.toLowerCase()}`, grupo: 'Temporada' });
  for (const e of f.eventos) out.push({ clave: 'eventos', valor: e, etiqueta: e, grupo: 'Evento' });
  if (f.tipoDia !== 'todos')
    out.push({ clave: 'tipoDia', etiqueta: TIPO_DIA_ETIQUETA[f.tipoDia], grupo: 'Tipo de día' });
  if (f.publicables === 'publicables')
    out.push({ clave: 'publicables', etiqueta: 'Solo días publicables', grupo: 'Calidad' });

  return out;
}

function formatearFecha(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a.slice(2)}`;
}
