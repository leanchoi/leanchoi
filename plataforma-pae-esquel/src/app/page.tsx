import React from "react";
import Link from "next/link";
import { TopoBackground } from "@/components/TopoBackground";

export default function HomePage() {
  return (
    <div>
      <header className="topbar">
        <div style={{ flex: 1, minWidth: 0 }}>
          <span className="crumb">Municipalidad de Esquel · Programa de Apoyo a la Educación</span>
          <h1>Plataforma Trocha</h1>
        </div>
        <span className="demo-badge">Datos demo</span>
      </header>

      <main className="canvas">
        <section className="card topo mb-3" style={{ padding: "28px" }}>
          <TopoBackground />
          <span className="rotulo mb-1">Sistema de gestión, trazabilidad e impacto del PAE</span>
          <h2 style={{ fontSize: "1.5rem", maxWidth: "34ch", lineHeight: 1.25 }}>
            Una vía angosta que abre paso en la cordillera
          </h2>
          <p className="mt-2" style={{ maxWidth: "75ch" }}>
            Trocha conecta el padrón municipal, la trayectoria educativa, el compromiso
            comunitario y la liquidación presupuestaria con auditoría inmutable, sin ranking
            público y con explicabilidad estricta.
          </p>
          <div className="row wrap mt-3" style={{ gap: "10px" }}>
            <Link href="/panel" className="btn btn-primary">
              Ver panel de conducción
            </Link>
            <Link href="/territorio" className="btn">
              Mesa de territorio
            </Link>
            <Link href="/estudiante" className="btn">
              Portal del estudiante
            </Link>
            <Link href="/transparencia" className="btn">
              Portal público
            </Link>
          </div>
        </section>

        <section className="grid g-3 mb-3">
          <article className="card">
            <span className="rotulo">M1 · Padrón y Trayectoria</span>
            <h3 className="mt-1">Padrón Único y Bóveda Documental</h3>
            <p className="small mt-1">
              Máquina de estados explícita con prohibición de bajas automáticas (R1).
              Principio once-only para documentación y distinción declarado/verificado.
            </p>
          </article>

          <article className="card">
            <span className="rotulo">M3 · Compromiso Comunitario</span>
            <h3 className="mt-1">QR Temporal y Geocerca</h3>
            <p className="small mt-1">
              Check-in sin persistencia de coordenadas (R2). La denegación de geolocalización
              nunca impide cumplir y deriva a validación manual (R3).
            </p>
          </article>

          <article className="card">
            <span className="rotulo">M4 · Alertas Tempranas</span>
            <h3 className="mt-1">Protocolo con SLA y Desglose</h3>
            <p className="small mt-1">
              Puntaje de riesgo siempre descompuesto (R8). Prohibición estricta de cierre sin
              intervención registrada en bitácora (R4).
            </p>
          </article>
        </section>

        <section className="grid g-2 mb-3">
          <article className="card">
            <span className="rotulo">M5 · Pagos y Presupuesto</span>
            <h3 className="mt-1">Padrón de Tesorería e Indexación</h3>
            <p className="small mt-1">
              Montos en centavos BigInt sin puntos flotantes. Registro del índice aplicado
              para reconstruir el poder de compra real y control de techo presupuestario (ADR-004).
            </p>
          </article>

          <article className="card">
            <span className="rotulo">M8 · Transparencia y M10 · Auditoría</span>
            <h3 className="mt-1">Supresión de Celdas Chicas y Principio Estonio</h3>
            <p className="small mt-1">
              Protección estadística de privacidad en cruces públicos (n &lt; 5). Registro de accesos
              auditable e inmutable visible para el titular en sus datos.
            </p>
          </article>
        </section>
      </main>
    </div>
  );
}