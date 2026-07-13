import { formatMoney, formatCompact } from "@/lib/money";
import { CHART } from "@/lib/chart-colors";

// Widgets server-safe de los paneles: KPIs, barras horizontales y split de canal.

export function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-card border border-ink/8 bg-white p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-ink/45">{label}</p>
      <p className="mt-1.5 font-display text-2xl font-bold text-ink">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink/50">{hint}</p>}
    </div>
  );
}

// Barras horizontales HTML (magnitud, un solo tono: secuencial) con etiqueta
// directa por fila — mas legible que un bar chart para pocos items.
export function BarRows({
  rows,
  colorHex = CHART.ventas,
}: {
  rows: { label: string; sublabel?: string; cents: number }[];
  colorHex?: string;
}) {
  const max = Math.max(...rows.map((r) => r.cents), 1);
  return (
    <div className="flex flex-col gap-3.5">
      {rows.map((row) => (
        <div key={row.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <p className="truncate font-medium text-ink">{row.label}</p>
            <p className="shrink-0 font-mono text-xs text-ink/60">{formatCompact(row.cents)}</p>
          </div>
          {row.sublabel && <p className="text-xs text-ink/45">{row.sublabel}</p>}
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink/5">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(2, (row.cents / max) * 100)}%`, background: colorHex }}
            />
          </div>
        </div>
      ))}
      {rows.length === 0 && <p className="py-6 text-center text-sm text-ink/45">Sin ventas en el período.</p>}
    </div>
  );
}

// Split de canal: barra 100% apilada con separador de 2px + leyenda con valores.
export function ChannelSplit({
  masterCents,
  sitioCents,
  masterLabel = "Marketplace Andar",
  sitioLabel = "Sitio propio",
}: {
  masterCents: number;
  sitioCents: number;
  masterLabel?: string;
  sitioLabel?: string;
}) {
  const total = masterCents + sitioCents;
  const masterPct = total > 0 ? (masterCents / total) * 100 : 50;
  return (
    <div>
      <div className="flex h-4 gap-0.5 overflow-hidden rounded-full">
        <div style={{ width: `${masterPct}%`, background: CHART.canalMaster }} />
        <div style={{ width: `${100 - masterPct}%`, background: CHART.canalSitio }} />
      </div>
      <div className="mt-3 flex flex-col gap-1.5 text-sm">
        <p className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-ink/70">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART.canalMaster }} />
            {masterLabel}
          </span>
          <span className="font-medium text-ink">
            {formatMoney(masterCents)} <span className="text-ink/40">({Math.round(masterPct)}%)</span>
          </span>
        </p>
        <p className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-ink/70">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART.canalSitio }} />
            {sitioLabel}
          </span>
          <span className="font-medium text-ink">
            {formatMoney(sitioCents)} <span className="text-ink/40">({100 - Math.round(masterPct)}%)</span>
          </span>
        </p>
      </div>
    </div>
  );
}

export function RangeTabs({ current, basePath }: { current: number; basePath: string }) {
  const ranges = [7, 30, 90];
  return (
    <div className="flex gap-1 rounded-full border border-ink/10 bg-white p-1">
      {ranges.map((r) => (
        <a
          key={r}
          href={`${basePath}?dias=${r}`}
          className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
            current === r ? "bg-pine text-bone" : "text-ink/60 hover:text-ink"
          }`}
        >
          {r} días
        </a>
      ))}
    </div>
  );
}
