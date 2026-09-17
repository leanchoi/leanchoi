import { describe, it, expect } from "vitest";
import { calcularRiesgo } from "@/lib/riesgo";

describe("Regla R8 · Puntaje de riesgo siempre descompuesto", () => {
  it("si existe puntaje de riesgo, el desglose debe contener items con senal y aporte", () => {
    const resultado = calcularRiesgo({
      diasRegularidadVencida: 25,
      rechazoBancario: true,
    });

    expect(resultado.puntajeTotal).toBeGreaterThan(0);
    expect(resultado.desglose).toBeDefined();
    expect(resultado.desglose.length).toBeGreaterThan(0);

    for (const item of resultado.desglose) {
      expect(item.senal).toBeTruthy();
      expect(item.aporte).toBeGreaterThan(0);
      expect(item.descripcion).toBeTruthy();
    }
  });

  it("la suma de los aportes coincide con el puntaje total", () => {
    const resultado = calcularRiesgo({
      diasRegularidadVencida: 20,
      porcentajeHorasCumplidas: 40,
      inasistenciasConsecutivas: 2,
    });

    const sumaAportes = resultado.desglose.reduce((acc, item) => acc + item.aporte, 0);
    expect(resultado.puntajeTotal).toEqual(sumaAportes);
  });
});