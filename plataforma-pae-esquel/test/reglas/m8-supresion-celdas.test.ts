import { describe, it, expect } from "vitest";
import { suprimirCeldasChicas, UMBRAL_SUPRESION } from "@/lib/transparencia";

describe("Regla M8 · Supresión de celdas chicas", () => {
  it("ninguna celda pública con menos de 5 casos debe exponer su valor numérico real", () => {
    const datosPrueba = [
      { categoria: "Ceferino", total: 34 },
      { categoria: "28 de Junio", total: 28 },
      { categoria: "Bella Vista", total: 4 }, // Menor a 5
      { categoria: "Englund", total: 2 },    // Menor a 5
      { categoria: "Matadero", total: 18 },
    ];

    const datosProtegidos = suprimirCeldasChicas(datosPrueba, "total");

    const bellaVista = datosProtegidos.find((d) => d.categoria === "Bella Vista");
    const englund = datosProtegidos.find((d) => d.categoria === "Englund");
    const ceferino = datosProtegidos.find((d) => d.categoria === "Ceferino");

    expect(bellaVista?.suprimido).toBe(true);
    expect(bellaVista?.total).toBe(`<${UMBRAL_SUPRESION}`);

    expect(englund?.suprimido).toBe(true);
    expect(englund?.total).toBe(`<${UMBRAL_SUPRESION}`);

    expect(ceferino?.suprimido).toBe(false);
    expect(ceferino?.total).toBe(34);
  });
});