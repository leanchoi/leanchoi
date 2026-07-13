"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART } from "@/lib/chart-colors";
import type { SeriesPoint } from "@/server/insights";

const money = (v: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", notation: "compact", maximumFractionDigits: 1 }).format(v);

// Serie temporal de ventas (y comision opcional). Colores fijos por entidad:
// ventas = verde, comision = ambar. Tooltip con crosshair, grilla recesiva.
export function SalesChart({ data, showCommission = false }: { data: SeriesPoint[]; showCommission?: boolean }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="fillVentas" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART.ventas} stopOpacity={0.22} />
              <stop offset="100%" stopColor={CHART.ventas} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis
            dataKey="day"
            tick={{ fill: CHART.axis, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            minTickGap={40}
          />
          <YAxis
            tick={{ fill: CHART.axis, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={money}
            width={64}
          />
          <Tooltip
            cursor={{ stroke: CHART.axis, strokeDasharray: "3 3" }}
            formatter={(value: number, name: string) => [money(value), name === "gmv" ? "Ventas" : "Comisión"]}
            labelStyle={{ color: "#101613", fontWeight: 600 }}
            contentStyle={{
              borderRadius: 10,
              border: "1px solid rgba(16,22,19,0.1)",
              background: "#fff",
              fontSize: 12,
            }}
          />
          <Area
            type="monotone"
            dataKey="gmv"
            stroke={CHART.ventas}
            strokeWidth={2}
            fill="url(#fillVentas)"
            dot={false}
            activeDot={{ r: 4 }}
          />
          {showCommission && (
            <Area
              type="monotone"
              dataKey="comision"
              stroke={CHART.comision}
              strokeWidth={2}
              fill="transparent"
              dot={false}
              activeDot={{ r: 4 }}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
      {showCommission && (
        <div className="mt-2 flex gap-5 text-xs text-ink/60">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded" style={{ background: CHART.ventas }} /> Ventas
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded" style={{ background: CHART.comision }} /> Comisión master
          </span>
        </div>
      )}
    </div>
  );
}
