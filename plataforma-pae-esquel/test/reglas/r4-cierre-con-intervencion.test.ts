import { describe, it, expect } from "vitest";
import { ResultadoIntervencion } from "@prisma/client";
import { validarCierreAlerta } from "@/lib/alertas";

describe("Regla R4 · Ninguna alerta se cierra sin intervención registrada", () => {
  it("debe fallar si se intenta cerrar sin intervenciones", () => {
    expect(() =>
      validarCierreAlerta({
        alertaId: "al-101",
        usuarioId: "usr-operador-1",
        intervencionesExistentes: [],
      })
    ).toThrow(/Regla R4 violada/);
  });

  it("debe fallar si las intervenciones registradas son vacías o «sin acción»", () => {
    expect(() =>
      validarCierreAlerta({
        alertaId: "al-101",
        usuarioId: "usr-operador-1",
        intervencionesExistentes: [
          {
            id: "int-1",
            tipo: "NOTIFICACION",
            detalle: "   ",
            resultado: ResultadoIntervencion.SIN_RESPUESTA,
          },
        ],
      })
    ).toThrow(/Regla R4 violada/);
  });

  it("debe permitir el cierre si existe al menos una intervención registrada con detalle", () => {
    expect(() =>
      validarCierreAlerta({
        alertaId: "al-101",
        usuarioId: "usr-operador-1",
        intervencionesExistentes: [
          {
            id: "int-1",
            tipo: "ENTREVISTA_PRESENCIAL",
            detalle: "Se acordó nuevo cronograma de apoyo escolar en la sede Ceferino.",
            resultado: ResultadoIntervencion.RESUELTA,
          },
        ],
      })
    ).not.toThrow();
  });
});