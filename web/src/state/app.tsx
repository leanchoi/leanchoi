/** Contexto global: metadatos, filtros, tema y estado de carga del motor. */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from 'react';
import { cargarMeta, inicializar, type Meta, type ProgresoCarga } from '../db/duckdb';
import { FILTROS_VACIOS, reducer, type AccionFiltro, type Filtros } from './filtros';

export type Tema = 'claro' | 'oscuro' | 'sistema';

interface AppCtx {
  meta: Meta | null;
  listo: boolean;
  progreso: ProgresoCarga;
  error: string | null;
  filtros: Filtros;
  dispatch: (a: AccionFiltro) => void;
  tema: Tema;
  setTema: (t: Tema) => void;
  /** Etiqueta corta y legible de una categoría (el dato viene en MAYÚSCULAS). */
  etiquetaCategoria: (nombre: string) => string;
  /** Nombre abreviado, para ejes angostos. */
  cortaCategoria: (nombre: string) => string;
}

const Ctx = createContext<AppCtx | null>(null);

const CLAVE_TEMA = 'oit.tema';

function aplicarTema(t: Tema) {
  const raiz = document.documentElement;
  if (t === 'sistema') raiz.removeAttribute('data-theme');
  else raiz.setAttribute('data-theme', t === 'oscuro' ? 'dark' : 'light');
}

export function ProveedorApp({ children }: { children: ReactNode }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progreso, setProgreso] = useState<ProgresoCarga>({
    fase: 'motor',
    detalle: 'Iniciando',
    progreso: 0,
  });
  const [filtros, dispatch] = useReducer(reducer, FILTROS_VACIOS);
  const [tema, setTemaEstado] = useState<Tema>(
    () => (localStorage.getItem(CLAVE_TEMA) as Tema) || 'sistema',
  );

  useEffect(() => {
    aplicarTema(tema);
    localStorage.setItem(CLAVE_TEMA, tema);
  }, [tema]);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const m = await cargarMeta();
        if (!cancelado) setMeta(m);
        await inicializar((p) => {
          if (!cancelado) setProgreso(p);
        });
        if (!cancelado) setListo(true);
      } catch (e) {
        if (!cancelado) setError((e as Error).message);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  const etiquetas = useMemo(() => {
    const largo = new Map<string, string>();
    const corto = new Map<string, string>();
    for (const c of meta?.categorias ?? []) {
      largo.set(c.nombre, c.etiqueta);
      corto.set(c.nombre, c.corta);
    }
    return { largo, corto };
  }, [meta]);

  const valor = useMemo<AppCtx>(
    () => ({
      meta,
      listo,
      progreso,
      error,
      filtros,
      dispatch,
      tema,
      setTema: setTemaEstado,
      etiquetaCategoria: (n) => etiquetas.largo.get(n) ?? capitalizar(n),
      cortaCategoria: (n) => etiquetas.corto.get(n) ?? capitalizar(n),
    }),
    [meta, listo, progreso, error, filtros, tema, etiquetas],
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

function capitalizar(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

export function useApp(): AppCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp debe usarse dentro de <ProveedorApp>');
  return ctx;
}
