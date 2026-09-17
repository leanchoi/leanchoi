import React from "react";
import Link from "next/link";
import { TopoBackground } from "@/components/TopoBackground";

interface Props {
  params: Promise<{ codigo: string }>;
}

export default async function VerificarCredencialPage({ params }: Props) {
  const { codigo } = await params;

  // En producción o con seed demo, este código valida contra Credencial en Prisma
  const credencialValida = {
    codigo: codigo || "TR-2026-9B41E",
    estudianteNombre: "Camila R.",
    cicloAnio: 2026,
    nivel: "Educación Superior",
    horasTotales: 30,
    horasCumplidas: 30,
    tareas: [
      "Apoyo escolar pedagógico a becarios de nivel secundario",
      "Talleres de alfabetización y refuerzo de matemática",
      "Participación en jornadas comunitarias barriales",
    ],
    sedeNombre: "Sede Vecinal Barrio 28 de Junio",
    referenteNombre: "Gastón Escobar",
    emitidaEn: "01/12/2026",
    estado: "VÁLIDA Y VERIFICADA",
  };

  return (
    <div>
      <header className="topbar">
        <div style={{ flex: 1, minWidth: 0 }}>
          <span className="crumb">Validación de Credenciales de Experiencia</span>
          <h1>Verificación de Certificado</h1>
        </div>
        <Link href="/" className="btn small">
          Volver al inicio
        </Link>
      </header>

      <main className="canvas">
        <section className="card topo mb-3" style={{ maxWidth: "680px", margin: "0 auto", padding: "24px" }}>
          <TopoBackground />
          <div className="row-between mb-2">
            <span className="rotulo">Constancia Oficial de Experiencia</span>
            <span className="pill ok"><i>✓</i> {credencialValida.estado}</span>
          </div>

          <h2 style={{ fontSize: "1.4rem" }}>
            Credencial N° {credencialValida.codigo}
          </h2>
          <p className="small mt-1" style={{ color: "var(--ink-2)" }}>
            Municipalidad de Esquel · Programa de Apoyo a la Educación (PAE).
            Por razones de protección de datos (Ley 25.326), solo se acredita la identidad básica y el detalle formativo.
          </p>

          <div className="card mt-3" style={{ background: "var(--plane)" }}>
            <div className="grid g-2">
              <div>
                <span className="rotulo">Titular acreditado</span>
                <div className="strong mt-1">{credencialValida.estudianteNombre}</div>
                <span className="tiny muted">{credencialValida.nivel}</span>
              </div>
              <div>
                <span className="rotulo">Horas comunitarias acreditadas</span>
                <div className="strong mt-1 num" style={{ fontSize: "1.2rem", color: "var(--s3)" }}>
                  {credencialValida.horasCumplidas} Horas reloj
                </div>
                <span className="tiny muted">100% validadas</span>
              </div>
            </div>

            <div className="divider" style={{ margin: "14px 0" }} />

            <div>
              <span className="rotulo mb-1">Tareas y competencias desarrolladas</span>
              <ul className="small" style={{ paddingLeft: "18px", margin: "6px 0", color: "var(--ink-1)" }}>
                {credencialValida.tareas.map((t, idx) => (
                  <li key={idx} style={{ marginBottom: "4px" }}>
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            <div className="divider" style={{ margin: "14px 0" }} />

            <div className="grid g-2">
              <div>
                <span className="rotulo">Sede y referente de validación</span>
                <div className="small strong mt-1">{credencialValida.sedeNombre}</div>
                <span className="tiny muted">Referente: {credencialValida.referenteNombre}</span>
              </div>
              <div>
                <span className="rotulo">Fecha de emisión</span>
                <div className="small strong mt-1">{credencialValida.emitidaEn}</div>
                <span className="tiny muted">Firma digital municipal</span>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}