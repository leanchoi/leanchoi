import { describe, it, expect } from "vitest";
import { EstadoPostulacion } from "@prisma/client";
import { validarTransicionEstado } from "@/lib/transicion";

describe("Regla R1 · Sin baja automática", () => {
  it("debe fallar si se intenta suspender sin usuarioId", () => {
    expect(() =>
      validarTransicionEstado({
        postulacionId: "post-123",
        hacia: EstadoPostulacion.SUSPENDIDA,
        motivo: "Incumplimiento de horas",
        usuarioId: null,
      })
    ).toThrow(/Regla R1 violada/);
  });

  it("debe fallar si se intenta dar de baja sin usuarioId", () => {
    expect(() =>
      validarTransicionEstado({
        postulacionId: "post-123",
        hacia: EstadoPostulacion.BAJA,
        motivo: "Abandono informado",
        usuarioId: undefined,
      })
    ).toThrow(/Regla R1 violada/);
  });

  it("debe fallar si se intenta rechazar sin usuarioId", () => {
    expect(() =>
      validarTransicionEstado({
        postulacionId: "post-123",
        hacia: EstadoPostulacion.RECHAZADA,
        motivo: "No cumple residencia",
        usuarioId: "",
      })
    ).toThrow(/Regla R1 violada/);
  });

  it("debe permitir la transición si una persona responsable firma con usuarioId", () => {
    expect(() =>
      validarTransicionEstado({
        postulacionId: "post-123",
        hacia: EstadoPostulacion.SUSPENDIDA,
        motivo: "Dictamen fundado de la Dirección",
        fundamento: "Resolución N° 45/26",
        usuarioId: "usr-directora-aldana",
      })
    ).not.toThrow();
  });
});