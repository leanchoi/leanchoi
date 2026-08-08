/** Barra de filtros global + chips de lo que está activo. */

import { useApp } from '../state/app';
import { chips as construirChips, contarFiltros, type TipoDia } from '../state/filtros';
import { GrupoBotones, Segmentado } from './ui';
import { DIAS_ABBR, MESES_ABBR } from '../lib/formato';

export function BarraFiltros() {
  const { filtros, dispatch, meta, etiquetaCategoria } = useApp();

  const mesesDisponibles = Array.from({ length: 12 }, (_, i) => i + 1);
  const hasta = meta?.periodo.hasta ?? '';
  const desde = meta?.periodo.desde ?? '';

  return (
    <>
      <div className="barra-filtros">
        <div className="filtro-bloque">
          <label htmlFor="f-desde">Período</label>
          <input
            id="f-desde"
            className="control"
            type="date"
            min={desde}
            max={hasta}
            value={filtros.desde ?? ''}
            onChange={(e) => dispatch({ tipo: 'rango', desde: e.target.value || null, hasta: filtros.hasta })}
          />
          <span aria-hidden="true">→</span>
          <input
            className="control"
            type="date"
            min={desde}
            max={hasta}
            value={filtros.hasta ?? ''}
            onChange={(e) => dispatch({ tipo: 'rango', desde: filtros.desde, hasta: e.target.value || null })}
          />
        </div>

        <div className="filtro-bloque">
          <label>Mes</label>
          <GrupoBotones
            etiqueta="Filtrar por mes"
            opciones={mesesDisponibles.map((m) => ({ valor: m, etiqueta: MESES_ABBR[m - 1] }))}
            seleccionados={filtros.meses}
            onAlternar={(v) => dispatch({ tipo: 'alternarMes', mes: Number(v) })}
          />
        </div>

        <div className="filtro-bloque">
          <label>Quincena</label>
          <GrupoBotones
            etiqueta="Filtrar por quincena"
            opciones={[
              { valor: 1, etiqueta: '1ª' },
              { valor: 2, etiqueta: '2ª' },
            ]}
            seleccionados={filtros.quincenas}
            onAlternar={(v) => dispatch({ tipo: 'alternarQuincena', quincena: Number(v) })}
          />
        </div>

        <div className="filtro-bloque">
          <label>Día</label>
          <GrupoBotones
            etiqueta="Filtrar por día de la semana"
            opciones={DIAS_ABBR.map((d, i) => ({ valor: i, etiqueta: d }))}
            seleccionados={filtros.dow}
            onAlternar={(v) => dispatch({ tipo: 'alternarDow', dow: Number(v) })}
          />
        </div>

        <div className="filtro-bloque">
          <label>Tipo de día</label>
          <Segmentado<TipoDia>
            etiqueta="Tipo de día"
            valor={filtros.tipoDia}
            onChange={(v) => dispatch({ tipo: 'tipoDia', valor: v })}
            opciones={[
              { valor: 'todos', etiqueta: 'Todos' },
              { valor: 'no_laborable', etiqueta: 'Findes y feriados', titulo: 'Sábados, domingos y feriados' },
              { valor: 'laborable', etiqueta: 'Hábiles' },
            ]}
          />
        </div>
      </div>

      <ChipsActivos />
    </>
  );

  function ChipsActivos() {
    const activos = construirChips(filtros, etiquetaCategoria);
    if (contarFiltros(filtros) === 0) {
      return (
        <div className="chips">
          <span className="chips-titulo">Sin filtros</span>
          <span style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-3)' }}>
            Hacé clic en cualquier barra, celda o día del tablero para filtrar todo lo demás.
          </span>
        </div>
      );
    }
    return (
      <div className="chips">
        <span className="chips-titulo">Filtros</span>
        {activos.map((c, i) => (
          <button
            key={`${c.clave}-${c.valor ?? i}`}
            type="button"
            className="chip"
            onClick={() => dispatch({ tipo: 'quitar', clave: c.clave, valor: c.valor })}
            title={`Quitar el filtro ${c.etiqueta}`}
          >
            <span className="grupo">{c.grupo}</span>
            {c.etiqueta}
            <span className="cerrar" aria-hidden="true">
              ×
            </span>
          </button>
        ))}
        <button type="button" className="chip-limpiar" onClick={() => dispatch({ tipo: 'reiniciar' })}>
          Limpiar todo
        </button>
      </div>
    );
  }
}
