import { describe, it, expect } from "vitest";
import { calcularRiesgo, validarVariablesProhibidas } from "@/lib/riesgo";

describe("Regla R6 · Variables prohibidas fuera del puntaje", () => {
  it("debe rechazar cualquier payload que intente inyectar variables prohibidas", () => {
    const payloadInvalido = {
      diasRegularidadVencida: 20,
      barrio: "Ceferino", // Prohibido como predictor individual
      salud: "Enfermedad crónica",
      religion: "Católica",
      nacionalidad: "Extranjera",
    };

    expect(() => validarVariablesProhibidas(payloadInvalido)).toThrow(/Regla R6 violada/);
    expect(() => calcularRiesgo({}, payloadInvalido)).toThrow(/Regla R6 violada/);
  });

  it("el cálculo de riesgo con factores legítimos no debe arrojar error", () => {
    const resultado = calcularRiesgo({
      diasRegularidadVencida: 22,
      porcentajeHorasCumplidas: 45,
      diasSinContacto: 51,
    });

    expect(resultado.puntajeTotal).toBeGreaterThan(0);
    expect(resultado.desglose.length).toBe(3);
  });
});