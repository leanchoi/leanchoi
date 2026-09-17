import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { evaluarGeocerca } from "@/lib/geocerca";

describe("Regla R2 · Sin coordenadas del estudiante", () => {
  it("el modelo RegistroHoras en schema.prisma no debe contener campos de latitud ni longitud", () => {
    const schemaPath = path.resolve(__dirname, "../../prisma/schema.prisma");
    const schemaContent = fs.readFileSync(schemaPath, "utf8");

    // Extraer bloque model RegistroHoras
    const modelMatch = schemaContent.match(/model\s+RegistroHoras\s*\{([^}]+)\}/);
    expect(modelMatch).not.toBeNull();

    // Eliminar comentarios para verificar únicamente definiciones de campos
    const modelBody = modelMatch![1];
    const lineasCodigo = modelBody
      .split("\n")
      .map((linea) => linea.replace(/\/\/.*$/, "").trim())
      .filter((linea) => linea.length > 0 && !linea.startsWith("@@"));

    const nombresCampos = lineasCodigo.map((l) => l.split(/\s+/)[0]);

    expect(nombresCampos).not.toContain("latitud");
    expect(nombresCampos).not.toContain("longitud");
    expect(nombresCampos).not.toContain("coordenadas");
    expect(nombresCampos).not.toContain("lat");
    expect(nombresCampos).not.toContain("lng");
  });

  it("la función evaluarGeocerca nunca retorna latitud ni longitud", () => {
    const resultado = evaluarGeocerca({
      sedeLatitud: -42.9133,
      sedeLongitud: -71.3197,
      sedeRadioMetros: 150,
      coordenadasDispositivo: { latitud: -42.9135, longitud: -71.3199 },
      precisionMetros: 12,
    });

    expect(resultado).toHaveProperty("dentroDeGeocerca");
    expect(resultado).toHaveProperty("precisionMetros");
    expect(resultado).not.toHaveProperty("latitud");
    expect(resultado).not.toHaveProperty("longitud");
    expect(resultado).not.toHaveProperty("coords");
  });
});