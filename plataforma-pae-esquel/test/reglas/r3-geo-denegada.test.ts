import { describe, it, expect } from "vitest";
import { evaluarGeocerca } from "@/lib/geocerca";

describe("Regla R3 · Permiso de geolocalización denegado nunca impide cumplir", () => {
  it("debe completar check-in con dentroDeGeocerca = null cuando coordenadasDispositivo es null o undefined", () => {
    const resultado = evaluarGeocerca({
      sedeLatitud: -42.9133,
      sedeLongitud: -71.3197,
      sedeRadioMetros: 150,
      coordenadasDispositivo: null, // Permiso denegado por el usuario en el navegador
      precisionMetros: null,
    });

    expect(resultado.dentroDeGeocerca).toBeNull();
    // La ausencia de coordenadas no genera excepción ni rechazo
  });
});