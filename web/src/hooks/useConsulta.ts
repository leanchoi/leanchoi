/**
 * Hook de consulta.
 *
 * Detalle importante para la sensación de fluidez: mientras se recalcula, el
 * hook **mantiene el resultado anterior** y solo marca `recargando`. Los
 * gráficos lo dibujan atenuado en vez de desmontarse, así que al mover un
 * filtro el tablero no parpadea ni salta de layout.
 */

import { useEffect, useRef, useState } from 'react';
import { consultar } from '../db/duckdb';
import { useApp } from '../state/app';

export interface EstadoConsulta<T> {
  datos: T[];
  cargando: boolean;
  recargando: boolean;
  error: string | null;
}

export function useConsulta<T = Record<string, unknown>>(
  sql: string | null,
  deps: unknown[] = [],
): EstadoConsulta<T> {
  const { listo } = useApp();
  const [datos, setDatos] = useState<T[]>([]);
  const [cargando, setCargando] = useState(true);
  const [recargando, setRecargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const primera = useRef(true);
  const token = useRef(0);

  useEffect(() => {
    if (!listo || !sql) return;
    const mio = ++token.current;

    if (primera.current) setCargando(true);
    else setRecargando(true);

    consultar<T>(sql)
      .then((filas) => {
        if (token.current !== mio) return; // llegó tarde: hay una consulta más nueva
        setDatos(filas);
        setError(null);
      })
      .catch((e: Error) => {
        if (token.current !== mio) return;
        setError(e.message);
        console.error(e);
      })
      .finally(() => {
        if (token.current !== mio) return;
        primera.current = false;
        setCargando(false);
        setRecargando(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listo, sql, ...deps]);

  return { datos, cargando, recargando, error };
}
