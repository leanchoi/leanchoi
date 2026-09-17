"use client";

import React, { useState } from "react";
import { TopoBackground } from "@/components/TopoBackground";
import {
  LineChart,
  BarsH,
  BarsV,
  Cartogram,
  Sparkline,
} from "@/components/Charts";

export default function PanelConduccionPage() {
  const [modo, setModo] = useState<"intendente" | "directora">("intendente");

  const meses = ["Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

  // Series del prototipo
  const ejecucionData = {
    labels: meses,
    series: [
      {
        name: "Plan anual",
        values: [10.2, 20.4, 30.6, 40.8, 51.0, 61.2, 71.4, 81.6, 91.8, 102.0],
        color: "var(--ink-3)",
      },
      {
        name: "Devengado real",
        values: [9.8, 19.9, 30.1, 39.4, 49.1, 59.8, 70.2, 80.6, 90.9, 99.4],
        color: "var(--s1)",
        area: true,
      },
    ],
  };

  const poderCompraData = {
    labels: meses,
    series: [
      {
        name: "Poder de compra real",
        values: [100, 96.4, 92.8, 89.1, 86.0, 83.2, 80.4, 77.9, 75.3, 73.1],
        color: "var(--accent)",
        area: true,
      },
    ],
  };

  const embudoData = [
    { label: "Postulaciones iniciadas", value: 412, note: "" },
    { label: "Presentadas completas", value: 361, note: "−12%" },
    { label: "Admitidas", value: 284, note: "−21%" },
    { label: "Activas al cierre", value: 259, note: "−9%" },
    { label: "Con regularidad al día", value: 241, note: "−7%" },
    { label: "Egresadas del nivel", value: 63, note: "cohorte" },
  ];

  const barriosCarto = [
    { label: "Ceferino", value: 34, display: "34", note: "8 en riesgo · junta a regularizar" },
    { label: "28 de Junio", value: 31, display: "31", note: "5 en riesgo · sede alta actividad" },
    { label: "Estación", value: 27, display: "27", note: "6 en riesgo" },
    { label: "Winter", value: 24, display: "24", note: "4 en riesgo" },
    { label: "Don Bosco", value: 22, display: "22", note: "3 en riesgo" },
    { label: "Malvinas", value: 21, display: "21", note: "5 en riesgo" },
    { label: "Los Sauces", value: 19, display: "19", note: "2 en riesgo" },
    { label: "Matadero", value: 18, display: "18", note: "4 en riesgo" },
    { label: "S. Cabral", value: 16, display: "16", note: "2 en riesgo" },
    { label: "Bella Vista", value: 14, display: "14", note: "1 en riesgo" },
    { label: "Englund", value: 12, display: "12", note: "2 en riesgo" },
    { label: "Bs. Aires", value: 11, display: "11", note: "1 en riesgo" },
    { label: "Centro", value: 10, display: "10", note: "1 en riesgo" },
  ];

  const horasSedeData = [
    { label: "28 de Junio", value: 412, display: "412 h", note: "96% validadas" },
    { label: "Ceferino", value: 388, display: "388 h", note: "91% validadas" },
    { label: "Estación", value: 301, display: "301 h", note: "94% validadas" },
    { label: "Don Bosco", value: 244, display: "244 h", note: "89% validadas" },
    { label: "Malvinas", value: 198, display: "198 h", note: "97% validadas" },
    { label: "Los Sauces", value: 121, display: "121 h", note: "85% validadas" },
    { label: "Bella Vista", value: 64, display: "64 h", note: "92% validadas" },
  ];

  const permanenciaNivel = {
    labels: ["Primario", "Secundario", "Superior", "F. Profesional"],
    series: [
      { name: "Ciclo 2025", values: [96, 84, 79, 88], color: "var(--ink-3)" },
      { name: "Ciclo 2026", values: [97, 89, 86, 91], color: "var(--s3)" },
    ],
  };

  const alertasUrgentes = [
    { id: "AL-2411", est: "M. G.", nivel: "Superior", motivo: "Regularidad vencida hace 22 días", sev: "crit", sla: "−2 d", resp: "Equipo Ext. Educativa" },
    { id: "AL-2406", est: "J. P.", nivel: "Secundario", motivo: "Horas al 41% de lo esperado", sev: "bad", sla: "−1 d", resp: "Sede Ceferino" },
    { id: "AL-2398", est: "L. R.", nivel: "Superior", motivo: "Sin contacto efectivo hace 51 días", sev: "bad", sla: "hoy", resp: "Equipo Ext. Educativa" },
    { id: "AL-2395", est: "S. A.", nivel: "Secundario", motivo: "Rechazo bancario del pago", sev: "warn", sla: "1 d", resp: "Tesorería" },
    { id: "AL-2390", est: "D. C.", nivel: "Superior", motivo: "2 faltas consecutivas sin aviso", sev: "warn", sla: "2 d", resp: "Sede 28 de Junio" },
  ];

  return (
    <div>
      <header className="topbar">
        <div style={{ flex: 1, minWidth: 0 }}>
          <span className="crumb">Municipalidad de Esquel · Programa de Apoyo a la Educación</span>
          <h1>Panel de conducción</h1>
        </div>

        <div className="seg" role="group" aria-label="Modo de vista">
          <button
            type="button"
            aria-pressed={modo === "intendente"}
            onClick={() => setModo("intendente")}
          >
            Intendente
          </button>
          <button
            type="button"
            aria-pressed={modo === "directora"}
            onClick={() => setModo("directora")}
          >
            Directora
          </button>
        </div>

        <span className="demo-badge">Datos demo</span>
      </header>

      <main className="canvas">
        {/* CIFRA PROTAGONISTA — única por vista */}
        <section className="hero topo mb-3">
          <TopoBackground />
          <div>
            <span className="rotulo mb-0">Permanencia del ciclo 2026</span>
            <div className="hero-fig">
              91<sup>%</sup>
            </div>
          </div>
          <div className="hero-side">
            <div className="row wrap">
              <span className="delta up">▲ 4,2 pts</span>
              <span className="delta-note">vs. ciclo 2025</span>
            </div>
            <p>
              De cada 100 estudiantes que ingresaron al programa en marzo,{" "}
              <strong>91 seguían estudiando al cierre</strong>. Primera vez con trazabilidad
              nominal completa.
            </p>
          </div>
          <div style={{ flex: "none" }}>
            <span className="rotulo">Tendencia 12 meses</span>
            <div className="mt-1">
              <Sparkline values={[81, 82, 80, 83, 84, 85, 84, 86, 87, 88, 89, 91]} width={140} height={36} />
            </div>
          </div>
        </section>

        {/* INDICADORES */}
        <section className="grid g-4 mb-3" aria-label="Indicadores principales">
          <article className="card stat">
            <span className="rotulo">Costo por trayectoria sostenida</span>
            <div className="stat-val num">$371K</div>
            <div className="stat-row">
              <span className="delta up">▼ 10,0%</span>
              <span className="delta-note">vs. ciclo anterior</span>
            </div>
            <div className="mt-1">
              <Sparkline values={[412, 408, 405, 399, 396, 391, 388, 384, 380, 377, 374, 371]} color="var(--ink-3)" accent="var(--ok)" width={100} height={24} />
            </div>
          </article>

          <article className="card stat">
            <span className="rotulo">Horas comunitarias validadas</span>
            <div className="stat-val num">87<span style={{ fontSize: "0.6em" }}>%</span></div>
            <div className="stat-row">
              <span className="delta up">▲ 35 pts</span>
              <span className="delta-note">vs. registro en papel</span>
            </div>
            <div className="mt-1">
              <Sparkline values={[52, 58, 61, 66, 64, 71, 74, 78, 81, 84, 86, 87]} color="var(--ink-3)" accent="var(--s3)" width={100} height={24} />
            </div>
          </article>

          <article className="card stat">
            <span className="rotulo">Alertas atendidas en plazo</span>
            <div className="stat-val num">92<span style={{ fontSize: "0.6em" }}>%</span></div>
            <div className="stat-row">
              <span className="delta up">▲ 14 pts</span>
              <span className="delta-note">SLA cumplimiento</span>
            </div>
            <div className="mt-1">
              <Sparkline values={[62, 65, 71, 69, 74, 78, 81, 83, 86, 88, 90, 92]} color="var(--ink-3)" accent="var(--s1)" width={100} height={24} />
            </div>
          </article>

          <article className="card stat">
            <span className="rotulo">Poder de compra vigente</span>
            <div className="stat-val num">73,1<span style={{ fontSize: "0.6em" }}> pts</span></div>
            <div className="stat-row">
              <span className="delta down">▼ 26,9%</span>
              <span className="delta-note">licuación acumulada</span>
            </div>
            <div className="mt-1">
              <Sparkline values={[100, 96.4, 92.8, 89.1, 86.0, 83.2, 80.4, 77.9, 75.3, 73.1]} color="var(--ink-3)" accent="var(--crit)" width={100} height={24} />
            </div>
          </article>
        </section>

        {modo === "intendente" ? (
          <>
            {/* GRÁFICOS INTENDENTE */}
            <section className="grid g-2 mb-3">
              <article className="card">
                <div className="card-head">
                  <div>
                    <h3>Poder de compra real del monto (Índice Base 100)</h3>
                    <span className="card-note">Visibiliza la licuación inflacionaria (ADR-004)</span>
                  </div>
                </div>
                <LineChart
                  labels={poderCompraData.labels}
                  series={poderCompraData.series}
                  yFmt={(v) => `${v.toFixed(1)} pts`}
                  band={[85, 100]}
                  tableTitle="Evolución mensual del poder de compra"
                />
              </article>

              <article className="card">
                <div className="card-head">
                  <div>
                    <h3>Ejecución presupuestaria acumulada (en Millones ARS)</h3>
                    <span className="card-note">Devengado real vs plan programado</span>
                  </div>
                </div>
                <LineChart
                  labels={ejecucionData.labels}
                  series={ejecucionData.series}
                  yFmt={(v) => `$${v.toFixed(1)}M`}
                  tableTitle="Ejecución presupuestaria acumulada"
                />
              </article>
            </section>

            <section className="grid g-2 mb-3">
              <article className="card">
                <div className="card-head">
                  <div>
                    <h3>Embudo del ciclo 2026</h3>
                    <span className="card-note">Transición entre etapas y desgranamiento</span>
                  </div>
                </div>
                <BarsH data={embudoData} color="var(--s1)" tableTitle="Desgranamiento por etapa" />
              </article>

              <article className="card">
                <div className="card-head">
                  <div>
                    <h3>Distribución territorial por barrio</h3>
                    <span className="card-note">Rampa de un solo tono · 13 juntas identificadas (listado parcial)</span>
                  </div>
                </div>
                <Cartogram cells={barriosCarto} cols={5} tableTitle="Casos por junta vecinal" />
              </article>
            </section>
          </>
        ) : (
          <>
            {/* GRÁFICOS DIRECTORA */}
            <section className="grid g-2 mb-3">
              <article className="card">
                <div className="card-head">
                  <div>
                    <h3>Permanencia por nivel (Comparativa 2025 vs 2026)</h3>
                    <span className="card-note">Tasa sostenida por cohorte</span>
                  </div>
                </div>
                <BarsV
                  labels={permanenciaNivel.labels}
                  series={permanenciaNivel.series}
                  tableTitle="Permanencia por nivel educativo"
                />
              </article>

              <article className="card">
                <div className="card-head">
                  <div>
                    <h3>Horas comunitarias aportadas por sede vecinal</h3>
                    <span className="card-note">Compromiso territorial acumulado</span>
                  </div>
                </div>
                <BarsH data={horasSedeData} color="var(--s3)" tableTitle="Horas validadas por sede" />
              </article>
            </section>
          </>
        )}

        {/* TABLA DE ALERTAS FUERA DE PLAZO */}
        <section className="card mb-3">
          <div className="card-head">
            <div>
              <h3>Alertas con SLA en riesgo o vencido</h3>
              <span className="card-note">Requieren intervención humana obligatoria registrada</span>
            </div>
            <span className="pill warn"><i>!</i> 5 casos priorizados</span>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Estudiante</th>
                  <th>Nivel</th>
                  <th>Motivo de Alerta</th>
                  <th>Severidad</th>
                  <th className="n">Plazo SLA</th>
                  <th>Responsable Asignado</th>
                </tr>
              </thead>
              <tbody>
                {alertasUrgentes.map((a) => (
                  <tr key={a.id}>
                    <td className="strong">{a.id}</td>
                    <td>{a.est}</td>
                    <td>{a.nivel}</td>
                    <td>{a.motivo}</td>
                    <td>
                      <span className={`pill ${a.sev}`}>
                        <i>●</i> {a.sev === "crit" ? "Crítica" : a.sev === "bad" ? "Alta" : "Media"}
                      </span>
                    </td>
                    <td className="n">{a.sla}</td>
                    <td className="muted">{a.resp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}