export interface DatosElegibilidad {
  mesesResidenciaEsquel: number;
  ingresoMensualFamiliarCentavos: bigint;
  topeIngresoCicloCentavos: bigint;
  esInstitucionPublica: boolean;
  esAlumnoRegular: boolean;
  otraAyudaSimilar: boolean;
}

export interface ResultadoElegibilidad {
  esElegible: boolean;
  explicacion: string;
  motivosExclusion: string[];
}

/**
 * Motor de elegibilidad de M1:
 * Devuelve un texto explicativo legible en lenguaje llano.
 * Nunca un rechazo sin causa explícita.
 */
export function evaluarElegibilidad(datos: DatosElegibilidad): ResultadoElegibilidad {
  const motivos: string[] = [];

  // 1. Residencia mínima: 3 años (36 meses)
  if (datos.mesesResidenciaEsquel < 36) {
    const anios = Math.floor(datos.mesesResidenciaEsquel / 12);
    const meses = datos.mesesResidenciaEsquel % 12;
    motivos.push(
      `No cumple residencia mínima en Esquel: ${anios} año${anios !== 1 ? "s" : ""} y ${meses} mes${meses !== 1 ? "es" : ""} acreditados sobre 3 años requeridos`
    );
  }

  // 2. Tope de ingresos
  if (datos.ingresoMensualFamiliarCentavos > datos.topeIngresoCicloCentavos) {
    const ingresoPesos = Number(datos.ingresoMensualFamiliarCentavos / 100n).toLocaleString("es-AR");
    const topePesos = Number(datos.topeIngresoCicloCentavos / 100n).toLocaleString("es-AR");
    motivos.push(
      `El ingreso mensual familiar ($${ingresoPesos}) supera el tope fijado para la convocatoria ($${topePesos})`
    );
  }

  // 3. Institución pública
  if (!datos.esInstitucionPublica) {
    motivos.push("La institución educativa declarada no pertenece a la gestión pública");
  }

  // 4. Regularidad
  if (!datos.esAlumnoRegular) {
    motivos.push("No acredita condición de alumno regular en el período actual");
  }

  // 5. Incompatibilidad
  if (datos.otraAyudaSimilar) {
    motivos.push("Percibe otro beneficio o beca incompatible con el PAE");
  }

  if (motivos.length === 0) {
    return {
      esElegible: true,
      explicacion: "Cumple con la totalidad de los requisitos normativos del programa.",
      motivosExclusion: [],
    };
  }

  return {
    esElegible: false,
    explicacion: motivos.join(". ") + ".",
    motivosExclusion: motivos,
  };
}