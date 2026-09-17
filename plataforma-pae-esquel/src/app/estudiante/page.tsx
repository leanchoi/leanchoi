"use client";

import React, { useState } from "react";
import Link from "next/link";
import { TopoBackground } from "@/components/TopoBackground";
import { ProgressRing } from "@/components/Charts";

export default function PortalEstudiantePage() {
  const [tab, setTab] = useState<"beca" | "tramites" | "compromiso" | "datos">("beca");
  const [checkInHecho, setCheckInHecho] = useState(false);
  const [geoEstado, setGeoEstado] = useState<string | null>(null);

  const handleSimularCheckIn = (conGeo: boolean) => {
    if (conGeo) {
      setGeoEstado("Dentro de geocerca (Sede 28 de Junio)");
    } else {
      // Regla R3: Denegada
      setGeoEstado("Ubicación denegada. Check-in registrado y derivado a validación manual.");
    }
    setCheckInHecho(true);
  };

  return (
    <div>
      <header className="topbar">
        <div style={{ flex: 1, minWidth: 0 }}>
          <span className="crumb">Módulo M7 · Portal ciudadano móvil-primero</span>
          <h1>Portal del estudiante</h1>
        </div>
        <span className="demo-badge">Datos demo</span>
      </header>

      <main className="canvas">
        <section className="card topo mb-3" style={{ padding: "20px 24px" }}>
          <TopoBackground />
          <h2 style={{ maxWidth: "62ch" }}>Diseñado para el teléfono más simple y la peor conexión</h2>
          <p className="mt-1" style={{ maxWidth: "72ch" }}>
            Todo lo importante entra en una pantalla sin desplazarse: cuánto cobrás, cuándo y qué te falta.
            Sin ranking entre estudiantes (R5) y con registro transparente de quién consultó tus datos.
          </p>
          <div className="row wrap mt-2" style={{ gap: "8px" }}>
            <span className="pill mute"><i>▪</i> Funciona sin conexión</span>
            <span className="pill mute"><i>▪</i> Sin aplicación pesada para instalar</span>
            <span className="pill mute"><i>▪</i> Canal asistido siempre disponible (R7)</span>
            <span className="pill mute"><i>▪</i> Cero ranking competitivo (R5)</span>
          </div>
        </section>

        <div className="phone-wrap">
          {/* SIMULADOR DE DISPOSITIVO MÓVIL */}
          <div className="phone">
            <div className="phone-screen">
              <div className="phone-top">
                <div>
                  <span className="rotulo">Ciclo 2026</span>
                  <div style={{ fontWeight: 700, fontSize: "15px" }}>Hola, Camila</div>
                </div>
                <span className="pill ok"><i>✓</i> Beca activa</span>
              </div>

              <div className="phone-body">
                {tab === "beca" && (
                  <>
                    <article className="tile tile-accent">
                      <span className="rotulo">Próximo pago mensual</span>
                      <div className="row-between mt-1" style={{ alignItems: "flex-end" }}>
                        <div className="num" style={{ fontSize: "26px", fontWeight: 700, color: "var(--accent)" }}>
                          $148.500
                        </div>
                        <span className="small muted">Estimado: 10/10/2026</span>
                      </div>
                      <p className="small mt-2" style={{ margin: "8px 0 0" }}>
                        Tu constancia de regularidad está al día. El pago se acreditará directamente en tu cuenta bancaria declarada.
                      </p>
                    </article>

                    <article className="tile">
                      <span className="rotulo">Resumen del cuatrimestre</span>
                      <div className="row-between mt-1">
                        <span className="small">3 pagos cobrados</span>
                        <span className="num strong">$445.500</span>
                      </div>
                      <div className="row-between mt-1">
                        <span className="small">Horas comunitarias</span>
                        <span className="strong" style={{ color: "var(--s3)" }}>24 / 30 h (80%)</span>
                      </div>
                    </article>

                    <article className="tile">
                      <span className="rotulo">Credencial de experiencia</span>
                      <p className="small mt-1">
                        Código verificable para tu currículum:
                      </p>
                      <div className="row-between mt-1">
                        <span className="strong num" style={{ fontFamily: "var(--mono)" }}>TR-2026-9B41E</span>
                        <Link href="/verificar/TR-2026-9B41E" className="btn tiny btn-primary">
                          Verificar
                        </Link>
                      </div>
                    </article>
                  </>
                )}

                {tab === "tramites" && (
                  <>
                    <article className="tile">
                      <span className="rotulo">Documentación presentada</span>
                      <div className="mt-2" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        <div className="row-between small">
                          <div>
                            <div className="strong">Constancia de Regularidad</div>
                            <span className="tiny muted">Vence: 30/11/2026</span>
                          </div>
                          <span className="pill ok"><i>✓</i> Vigente</span>
                        </div>

                        <div className="row-between small">
                          <div>
                            <div className="strong">Certificado de Domicilio</div>
                            <span className="tiny muted">Reutilizado · Vence: 08/2027</span>
                          </div>
                          <span className="pill ok"><i>✓</i> Once-Only</span>
                        </div>

                        <div className="row-between small">
                          <div>
                            <div className="strong">DNI Frente y Dorso</div>
                            <span className="tiny muted">Verificado por agente</span>
                          </div>
                          <span className="pill ok"><i>✓</i> Validado</span>
                        </div>
                      </div>
                    </article>

                    <article className="tile">
                      <span className="rotulo">Canal Asistido (Regla R7)</span>
                      <p className="small mt-1">
                        ¿Dificultades para cargar archivos? Podés acercarte a la Sede Vecinal de 28 de Junio o al área de Extensión Educativa.
                      </p>
                    </article>
                  </>
                )}

                {tab === "compromiso" && (
                  <>
                    <article className="tile">
                      <div className="ring-wrap">
                        <ProgressRing percentage={80} size={74} color="var(--s3)" />
                        <div>
                          <span className="rotulo">Compromiso comunitario</span>
                          <div className="strong" style={{ fontSize: "15px" }}>24 de 30 horas</div>
                          <p className="tiny muted" style={{ margin: "2px 0 0" }}>
                            Te faltan 6 horas antes del cierre del ciclo.
                          </p>
                        </div>
                      </div>
                    </article>

                    <article className="tile">
                      <span className="rotulo">Proyecto asignado</span>
                      <div className="strong mt-1">Apoyo escolar en matemática</div>
                      <span className="small muted">Sede Barrial 28 de Junio · Martes y Jueves</span>

                      <div className="divider" style={{ margin: "10px 0" }} />

                      <span className="rotulo mb-1">Check-in de asistencia</span>
                      {checkInHecho ? (
                        <div className="pill ok" style={{ width: "100%", justifyContent: "center", padding: "8px" }}>
                          <i>✓</i> {geoEstado}
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <button
                            type="button"
                            onClick={() => handleSimularCheckIn(true)}
                            className="btn btn-primary small"
                            style={{ justifyContent: "center" }}
                          >
                            Marcar llegada con geocerca
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSimularCheckIn(false)}
                            className="btn small"
                            style={{ justifyContent: "center" }}
                          >
                            Marcar sin ubicación (Regla R3)
                          </button>
                          <span className="tiny muted text-center" style={{ textAlign: "center" }}>
                            R2: Jamás guardamos tus coordenadas personales.
                          </span>
                        </div>
                      )}
                    </article>
                  </>
                )}

                {tab === "datos" && (
                  <>
                    <article className="tile">
                      <span className="rotulo">Principio Estonio (M10)</span>
                      <h4 className="mt-1">¿Quién consultó tus datos?</h4>
                      <p className="tiny muted mt-1">
                        Transparencia radical: registro inmutable de todas las consultas realizadas sobre tu legajo.
                      </p>

                      <div className="mt-2" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        <div className="card" style={{ padding: "8px", background: "var(--plane)" }}>
                          <div className="row-between tiny">
                            <span className="strong">Dirección de Educación</span>
                            <span className="muted">Ayer 11:20</span>
                          </div>
                          <span className="tiny muted">Motivo: Validación de constancia cuatrimestral</span>
                        </div>

                        <div className="card" style={{ padding: "8px", background: "var(--plane)" }}>
                          <div className="row-between tiny">
                            <span className="strong">Tesorería Municipal</span>
                            <span className="muted">28/08/2026</span>
                          </div>
                          <span className="tiny muted">Motivo: Emisión del padrón de pago mensual</span>
                        </div>
                      </div>
                    </article>
                  </>
                )}
              </div>

              {/* BOTONES DE NAVEGACIÓN INFERIOR */}
              <div className="phone-tabs" role="tablist">
                <button
                  type="button"
                  aria-pressed={tab === "beca"}
                  onClick={() => setTab("beca")}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
                  </svg>
                  <span>Mi beca</span>
                </button>
                <button
                  type="button"
                  aria-pressed={tab === "tramites"}
                  onClick={() => setTab("tramites")}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                    <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
                  </svg>
                  <span>Trámites</span>
                </button>
                <button
                  type="button"
                  aria-pressed={tab === "compromiso"}
                  onClick={() => setTab("compromiso")}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                  <span>Horas</span>
                </button>
                <button
                  type="button"
                  aria-pressed={tab === "datos"}
                  onClick={() => setTab("datos")}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <path d="M12 21a9 9 0 100-18 9 9 0 000 18z" />
                    <path d="M12 8v4M12 16h.01" />
                  </svg>
                  <span>Mis datos</span>
                </button>
              </div>
            </div>
          </div>

          <div style={{ flex: 1, minWidth: "280px" }}>
            <article className="card mb-3">
              <span className="rotulo">Reglas ciudadanas implementadas</span>
              <h3 className="mt-1">Equidad de acceso y privacidad</h3>
              <ul className="small mt-2" style={{ paddingLeft: "18px", color: "var(--ink-2)" }}>
                <li><strong>Sin ranking:</strong> Nunca se compara al estudiante con otros ni se publican listas por rendimiento.</li>
                <li><strong>Geocerca segura:</strong> No hay rastreo satelital. Solo se valida si está dentro del perímetro de la sede en el instante en que el alumno marca asistencia.</li>
                <li><strong>Derecho a no geolocalizarse:</strong> Denegar permisos no suspende el beneficio; deriva a firma del referente vecinal.</li>
              </ul>
            </article>
          </div>
        </div>
      </main>
    </div>
  );
}