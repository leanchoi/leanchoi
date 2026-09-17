"use client";

import React, { useState } from "react";
import { TopoBackground } from "@/components/TopoBackground";

export default function MesaTerritorioPage() {
  const [intervencionDetalle, setIntervencionDetalle] = useState("");
  const [intervencionTipo, setIntervencionTipo] = useState("ENTREVISTA_PRESENCIAL");
  const [intervenciones, setIntervenciones] = useState([
    {
      id: "INT-1",
      tipo: "LLAMADA_TELEFONICA",
      detalle: "Se intentó contacto telefónico sin éxito. Derivado a visita de sede.",
      fecha: "Hace 2 días",
      responsable: "Operador Ext. Educativa",
    },
  ]);
  const [alertaCerrada, setAlertaCerrada] = useState(false);
  const [errorCierre, setErrorCierre] = useState("");

  const validaciones = [
    { est: "C. M.", sede: "28 de Junio", proyecto: "Apoyo escolar secundario", horas: 3, fecha: "Hoy 14:20", geo: "Dentro", ev: true },
    { est: "R. T.", sede: "Ceferino", proyecto: "Alfabetización digital", horas: 2, fecha: "Hoy 11:05", geo: "Dentro", ev: true },
    { est: "F. L.", sede: "Estación", proyecto: "Vivero y arbolado", horas: 4, fecha: "Ayer 16:40", geo: "Fuera de geocerca", ev: true },
    { est: "N. S.", sede: "Don Bosco", proyecto: "Campaña de salud barrial", horas: 3, fecha: "Ayer 09:30", geo: "Sin geocerca (permiso denegado)", ev: false },
    { est: "A. V.", sede: "28 de Junio", proyecto: "Apoyo escolar secundario", horas: 2, fecha: "Ayer 15:10", geo: "Dentro", ev: true },
  ];

  const matchingList = [
    { est: "C. M.", carrera: "Prof. de Matemática", proyecto: "Apoyo escolar a becarios de secundario", sede: "28 de Junio", afinidad: 94 },
    { est: "R. T.", carrera: "Tec. en Informática", proyecto: "Alfabetización digital adultos mayores", sede: "Ceferino", afinidad: 91 },
    { est: "N. S.", carrera: "Enfermería", proyecto: "Campaña de salud en sede barrial", sede: "Don Bosco", afinidad: 88 },
    { est: "F. L.", carrera: "Tec. Forestal", proyecto: "Vivero y arbolado urbano", sede: "Estación", afinidad: 86 },
    { est: "P. O.", carrera: "Turismo", proyecto: "Relevamiento de senderos", sede: "Los Sauces", afinidad: 79 },
  ];

  const handleAgregarIntervencion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!intervencionDetalle.trim()) return;

    setIntervenciones([
      ...intervenciones,
      {
        id: `INT-${intervenciones.length + 1}`,
        tipo: intervencionTipo,
        detalle: intervencionDetalle,
        fecha: "Recién",
        responsable: "Operador Actual",
      },
    ]);
    setIntervencionDetalle("");
    setErrorCierre("");
  };

  const handleCerrarAlerta = () => {
    if (intervenciones.length === 0) {
      setErrorCierre("Regla R4: No se puede cerrar la alerta sin registrar una intervención.");
      return;
    }
    setAlertaCerrada(true);
    setErrorCierre("");
  };

  return (
    <div>
      <header className="topbar">
        <div style={{ flex: 1, minWidth: 0 }}>
          <span className="crumb">Módulo M4 · Alertas y acompañamiento territorial</span>
          <h1>Mesa de territorio</h1>
        </div>
        <span className="demo-badge">Datos demo</span>
      </header>

      <main className="canvas">
        {/* RESUMEN INDICADORES */}
        <section className="grid g-4 mb-3">
          <article className="card stat">
            <span className="rotulo">Alertas abiertas</span>
            <div className="stat-val num">23</div>
            <div className="stat-row">
              <span className="pill warn"><i>!</i> 3 con plazo vencido</span>
            </div>
          </article>

          <article className="card stat">
            <span className="rotulo">Atendidas en plazo</span>
            <div className="stat-val num">92<span style={{ fontSize: "0.6em" }}>%</span></div>
            <div className="stat-row">
              <span className="delta-note">Meta institucional: 90%</span>
            </div>
          </article>

          <article className="card stat">
            <span className="rotulo">Horas por validar</span>
            <div className="stat-val num">17</div>
            <div className="stat-row">
              <span className="delta-note">Antigüedad media: 11 h</span>
            </div>
          </article>

          <article className="card stat">
            <span className="rotulo">Sedes activas</span>
            <div className="stat-val num">7<span style={{ fontSize: "0.52em" }}> / 18</span></div>
            <div className="stat-row">
              <span className="pill bad"><i>▲</i> 11 sin actividad</span>
            </div>
          </article>
        </section>

        {/* FICHA 360° + PUNTAJE DESCOMPUESTO (R8) + PROTOCOLO DE INTERVENCIÓN (R4) */}
        <section className="card mb-3">
          <div className="card-head">
            <div>
              <h3>Ficha de Acompañamiento · Alerta AL-2411 (M. G.)</h3>
              <span className="card-note">Estudiante de Nivel Superior · Sede Ceferino · Abierta hace 4 días</span>
            </div>
            {alertaCerrada ? (
              <span className="pill ok"><i>✓</i> Alerta resuelta y cerrada</span>
            ) : (
              <span className="pill crit"><i>●</i> Crítica · Plazo SLA vencido hace 2 días</span>
            )}
          </div>

          <div className="grid g-2 mb-3">
            {/* DESGLOSE OBLIGATORIO DE SEÑALES (R8) */}
            <div>
              <span className="rotulo mb-1">Puntaje de riesgo descompuesto (Regla R8)</span>
              <div className="card" style={{ background: "var(--plane)" }}>
                <div className="row-between mb-2">
                  <span className="strong">Puntaje total calculado: 85 pts</span>
                  <span className="pill crit">Riesgo Crítico</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div className="row-between small">
                    <span>Regularidad académica vencida hace 22 días</span>
                    <span className="strong num">+40 pts</span>
                  </div>
                  <div className="row-between small">
                    <span>Horas comunitarias al 45% del avance esperado</span>
                    <span className="strong num">+25 pts</span>
                  </div>
                  <div className="row-between small">
                    <span>Sin contacto efectivo registrado hace 51 días</span>
                    <span className="strong num">+20 pts</span>
                  </div>
                </div>
                <div className="divider" style={{ margin: "10px 0" }} />
                <p className="tiny muted" style={{ margin: 0 }}>
                  Nota ética (R6): Las variables prohibidas (barrio como predictor individual, salud, religión)
                  están estructuralmente excluidas de este cálculo.
                </p>
              </div>
            </div>

            {/* PROTOCOLO E INTERVENCIONES OBLIGATORIAS (R4) */}
            <div>
              <span className="rotulo mb-1">Bitácora obligatoria de intervención (Regla R4)</span>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {intervenciones.map((i) => (
                  <div key={i.id} className="card" style={{ padding: "10px 12px" }}>
                    <div className="row-between">
                      <span className="pill mute"><i>▪</i> {i.tipo}</span>
                      <span className="tiny muted">{i.fecha} · {i.responsable}</span>
                    </div>
                    <p className="small mt-1" style={{ margin: "6px 0 0" }}>
                      {i.detalle}
                    </p>
                  </div>
                ))}

                {!alertaCerrada && (
                  <form onSubmit={handleAgregarIntervencion} className="mt-2">
                    <div className="row mb-1">
                      <select
                        value={intervencionTipo}
                        onChange={(e) => setIntervencionTipo(e.target.value)}
                        className="btn small"
                        style={{ padding: "5px 8px" }}
                      >
                        <option value="ENTREVISTA_PRESENCIAL">Entrevista Presencial</option>
                        <option value="VISITA_DOMICILIARIA">Visita Domiciliaria</option>
                        <option value="CONTACTO_WHATSAPP">Contacto Asistido</option>
                        <option value="ARTICULACION_SEDE">Articulación con Sede</option>
                      </select>
                      <input
                        type="text"
                        placeholder="Detalle de la intervención realizada..."
                        value={intervencionDetalle}
                        onChange={(e) => setIntervencionDetalle(e.target.value)}
                        className="btn small"
                        style={{ flex: 1, textAlign: "left" }}
                      />
                      <button type="submit" className="btn btn-primary small">
                        Registrar
                      </button>
                    </div>
                  </form>
                )}

                {errorCierre && (
                  <div className="pill bad mt-1">
                    <i>▲</i> {errorCierre}
                  </div>
                )}

                {!alertaCerrada && (
                  <div className="row-between mt-2">
                    <span className="tiny muted">
                      Regla R4: «Sin acción» no es un estado de cierre admisible.
                    </span>
                    <button
                      type="button"
                      className="btn small"
                      onClick={handleCerrarAlerta}
                    >
                      Cerrar alerta con intervención
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* COLA DE VALIDACIÓN DE HORAS (R2 / R3) */}
        <section className="card mb-3">
          <div className="card-head">
            <div>
              <h3>Cola de validación de horas comunitarias</h3>
              <span className="card-note">
                R2: Solo resultado booleano y precisión · R3: La ubicación denegada deriva a validación manual
              </span>
            </div>
            <span className="pill mute">5 pendientes</span>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Estudiante</th>
                  <th>Sede</th>
                  <th>Proyecto Asignado</th>
                  <th className="n">Horas</th>
                  <th>Momento Check-In</th>
                  <th>Resultado Geocerca (R2)</th>
                  <th>Evidencia</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {validaciones.map((v, i) => (
                  <tr key={i}>
                    <td className="strong">{v.est}</td>
                    <td>{v.sede}</td>
                    <td>{v.proyecto}</td>
                    <td className="n">{v.horas} h</td>
                    <td className="muted">{v.fecha}</td>
                    <td>
                      {v.geo.includes("Dentro") ? (
                        <span className="pill ok"><i>✓</i> {v.geo}</span>
                      ) : v.geo.includes("denegado") ? (
                        <span className="pill warn"><i>!</i> Permiso denegado (R3)</span>
                      ) : (
                        <span className="pill bad"><i>▲</i> {v.geo}</span>
                      )}
                    </td>
                    <td>{v.ev ? <span className="pill mute">Foto adjunta</span> : <span className="muted">—</span>}</td>
                    <td>
                      <button type="button" className="btn tiny btn-primary">
                        Validar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* SUGERENCIAS MOTOR MATCHING */}
        <section className="card mb-3">
          <div className="card-head">
            <div>
              <h3>Puente Esquel · Sugerencias de afinidad comunitaria (M9)</h3>
              <span className="card-note">Vinculación de carrera y proyecto formativo</span>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Estudiante</th>
                  <th>Carrera</th>
                  <th>Proyecto Sugerido</th>
                  <th>Sede Barrial</th>
                  <th className="n">Afinidad</th>
                </tr>
              </thead>
              <tbody>
                {matchingList.map((m, idx) => (
                  <tr key={idx}>
                    <td className="strong">{m.est}</td>
                    <td>{m.carrera}</td>
                    <td>{m.proyecto}</td>
                    <td>{m.sede}</td>
                    <td className="n strong" style={{ color: "var(--s3)" }}>
                      {m.afinidad}%
                    </td>
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