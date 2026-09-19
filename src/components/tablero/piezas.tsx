/**
 * Las piezas del tablero y del informe.
 *
 * Criterio de presentación: la cobertura es un número, no un gráfico, así que va
 * como tile. Los rankings —problemas, motivos de no-respuesta— son una sola serie
 * ordenada de mayor a menor, con el valor escrito al lado de cada barra: no hace
 * falta leyenda ni color para distinguir nada, y se entiende igual fotocopiado.
 */

export function Tile({
  valor,
  etiqueta,
  detalle,
}: {
  valor: string;
  etiqueta: string;
  detalle?: string;
}) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-2xl font-semibold tabular-nums">{valor}</p>
      <p className="text-sm font-medium">{etiqueta}</p>
      {detalle && <p className="text-muted-foreground text-xs">{detalle}</p>}
    </div>
  );
}

export type FilaBarra = { etiqueta: string; cantidad: number; porcentaje: number };

export function Barras({ filas, vacio }: { filas: FilaBarra[]; vacio?: string }) {
  const maximo = filas.reduce((mayor, fila) => Math.max(mayor, fila.cantidad), 0);

  if (filas.length === 0 || maximo === 0) {
    return (
      <p className="text-muted-foreground mt-2 text-sm">
        {vacio ?? 'Todavía no hay datos para mostrar.'}
      </p>
    );
  }

  return (
    <ul className="mt-2">
      {filas.map((fila) => (
        <li key={fila.etiqueta} className="py-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span>{fila.etiqueta}</span>
            <span className="tabular-nums whitespace-nowrap">
              {fila.porcentaje}% <span className="text-muted-foreground">({fila.cantidad})</span>
            </span>
          </div>
          <div className="mt-1 h-2 w-full rounded-sm border">
            <div
              className="barra-dato bg-foreground h-full rounded-sm"
              style={{ width: `${Math.round((fila.cantidad / maximo) * 100)}%` }}
              role="presentation"
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function minutos(segundos: number | null): string {
  if (segundos === null) return '—';
  const min = Math.floor(segundos / 60);
  const resto = segundos % 60;
  return `${min}:${String(resto).padStart(2, '0')}`;
}
