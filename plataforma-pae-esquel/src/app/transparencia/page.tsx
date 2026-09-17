"use client";

import React from "react";
import { TopoBackground } from "@/components/TopoBackground";
import { suprimirCeldasChicas } from "@/lib/transparencia";

export default function TransparenciaPage() {
  // Datos reales del municipio procesados a través del motor de supresión de celdas chicas (M8)
  const datosBarriosCrudos = [
    { categoria: "Ceferino", total: 34, detalle: "Actividades de apoyo escolar y talleres" },
    { categoria: "28 de Junio", total: 31, detalle: "Alfabetización digital y biblioteca" },
    { categoria: "Estación", total: 27, detalle: "Arbolado urbano y huerta comunitaria" },
    { categoria: "Winter", total: 24, detalle: "Apoyo a personas mayores" },
    { categoria: "Don Bosco", total: 22, detalle: "Acompañamiento en sede" },
    { categoria: "Malvinas", total: 21, detalle: "Cuidado de espacios barriales" },
    { categoria: "Los Sauces", total: 19, detalle: "Relevamiento de senderos" },
    { categoria: "Matadero", total: 18, detalle: "Talleres culturales" },
    { categoria: "Sargento Cabral", total: 16, detalle: "Apoyo escolar" },
    { categoria: "Bella Vista", total: 4, detalle: "Actividades de sede" }, // MENOR A 5: debe ser suprimido
    { categoria: "Englund", total: 2, detalle: "Actividades de sede" },     // MENOR A 5: debe ser suprimido
  ];

  // Aplicación obligatoria de la Regla M8
  const barriosProtegidos = suprimirCeldasChicas(datosBarriosCrudos, "total");

  return (
    <div>
      <header className="topbar">
        <div style={{ flex: 1, minWidth: 0 }}>
          <span className="crumb">Módulo M8 · Acceso público sin necesidad de login</span>
          <h1>Portal público del PAE</h1>
        </div>
        <span className="demo-badge">Datos demo</span>
      </header>

      <main className="canvas">
        <section className="card topo mb-3" style={{ padding: "26px" }}>
          <TopoBackground />
          <h2 style={{ maxWidth: "32ch", lineHeight: 1.2 }}>
            Cada peso y cada hora, verificables por cualquier vecino
          </h2>
          <p className="mt-2" style={{ maxWidth: "76ch" }}>
            Las reglas se publican <strong>antes</strong> de aplicarse. Los resultados se publican
            con su metodología abierta. Ningún dato expuesto permite identificar de forma directa o indirecta a una persona.
          </p>
          <div className="row wrap mt-2" style={{ gap: "10px" }}>
            <button
              type="button"
              className="btn btn-ghost small"
              onClick={() => {
                const jsonStr = JSON.stringify(barriosProtegidos, null, 2);
                const blob = new Blob([jsonStr], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "pae-esquel-datos-abiertos.json";
                a.click();
              }}
            >
              Descargar Datos Abiertos (JSON)
            </button>
            <span className="pill mute">Licencia Abierta ODbL</span>
          </div>
        </section>

        {/* INDICADORES GLOBALES */}
        <section className="grid g-4 mb-3">
          <article className="card stat">
            <span className="rotulo">Monto vigente</span>
            <div className="stat-val num">$148.500</div>
            <div className="stat-row">
              <span className="delta-note">Próxima actualización: 01/01/2027</span>
            </div>
          </article>

          <article className="card stat">
            <span className="rotulo">Estudiantes alcanzados</span>
            <div className="stat-val num">284</div>
            <div className="stat-row">
              <span className="delta up">▲ 12%</span>
              <span className="delta-note">vs. ciclo anterior</span>
            </div>
          </article>

          <article className="card stat">
            <span className="rotulo">Horas comunitarias aportadas</span>
            <div className="stat-val num">1.728</div>
            <div className="stat-row">
              <span className="delta-note">En sedes vecinales de la ciudad</span>
            </div>
          </article>

          <article className="card stat">
            <span className="rotulo">Ejecución del programa</span>
            <div className="stat-val num">
              97,5<span style={{ fontSize: "0.6em" }}>%</span>
            </div>
            <div className="meter mt-1">
              <span style={{ width: "97.5%" }} />
            </div>
          </article>
        </section>

        {/* TABLA CON REGLA M8 APLICADA */}
        <section className="card mb-3">
          <div className="card-head">
            <div>
              <h3>Distribución de becarios por sede y barrio (Regla M8)</h3>
              <span className="card-note">
                Supresión estricta de celdas chicas: Toda cifra con menos de 5 beneficiarios se enmascara para resguardar la privacidad.
              </span>
            </div>
            <span className="pill ok"><i>✓</i> Celdas chicas anonimizadas</span>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Barrio / Sede Vecinal</th>
                  <th className="n">Beneficiarios</th>
                  <th>Proyectos y actividades comunitarias</th>
                  <th>Estado de Privacidad</th>
                </tr>
              </thead>
              <tbody>
                {barriosProtegidos.map((b) => (
                  <tr key={b.categoria}>
                    <td className="strong">{b.categoria}</td>
                    <td className="n strong">{b.total}</td>
                    <td>{b.detalle}</td>
                    <td>
                      {b.suprimido ? (
                        <span className="pill warn">
                          <i>!</i> Suprimido (n &lt; 5)
                        </span>
                      ) : (
                        <span className="pill mute">Publicado</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* METODOLOGÍA E INDEXACIÓN (ADR-004) */}
        <section className="grid g-2 mb-3">
          <article className="card">
            <span className="rotulo">Metodología de Actualización (ADR-004)</span>
            <h3 className="mt-1">Fórmula de poder de compra real</h3>
            <p className="small mt-2">
              Para evitar la licuación inflacionaria del beneficio y la exclusión de familias vulnerables,
              el monto del PAE se actualiza periódicamente siguiendo la variación del índice oficial de precios (IPC Patagónico),
              respetando el techo presupuestario municipal aprobado por ordenanza.
            </p>
          </article>

          <article className="card">
            <span className="rotulo">Criterios de Transparencia Activa</span>
            <h3 className="mt-1">Ley 27.275 de Acceso a la Información</h3>
            <p className="small mt-2">
              El municipio publica los criterios de elegibilidad, ponderación de señales y ejecución agregada.
              Nunca se publican datos personales de estudiantes, domicilios puntuales ni montos de ingresos familiares individuales.
            </p>
          </article>
        </section>
      </main>
    </div>
  );
}