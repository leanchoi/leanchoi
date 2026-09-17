export interface ItemPagoValidacion {
  postulacionId: string;
  estadoPostulacion: string;
  regularidadVigente: boolean;
  cbuValido: boolean;
  montoCentavos: bigint;
  motivoExclusion?: string;
}

export interface ConfiguracionCSV {
  separador?: ";" | ",";
  finDeLinea?: "\r\n" | "\n";
  incluirEncabezado?: boolean;
}

/**
 * Valida beneficiarios para inclusión en la liquidación de pago.
 * Informa cada exclusión con su motivo concreto.
 */
export function validarParaLiquidacion(
  beneficiarios: ItemPagoValidacion[]
): {
  admitidos: ItemPagoValidacion[];
  excluidos: Array<ItemPagoValidacion & { motivoExclusion: string }>;
} {
  const admitidos: ItemPagoValidacion[] = [];
  const excluidos: Array<ItemPagoValidacion & { motivoExclusion: string }> = [];

  for (const b of beneficiarios) {
    if (b.estadoPostulacion !== "ACTIVA") {
      excluidos.push({
        ...b,
        motivoExclusion: `Estado no activo (actual: ${b.estadoPostulacion})`,
      });
      continue;
    }

    if (!b.regularidadVigente) {
      excluidos.push({
        ...b,
        motivoExclusion: "Constancia de regularidad vencida o no presentada",
      });
      continue;
    }

    if (!b.cbuValido) {
      excluidos.push({
        ...b,
        motivoExclusion: "Datos bancarios o CBU inválidos o pendientes de validación",
      });
      continue;
    }

    admitidos.push(b);
  }

  return { admitidos, excluidos };
}

/**
 * Exporta el padrón a CSV adaptado al formato exacto de Tesorería.
 * Configuración de separador y codificación para compatibilidad con sistemas contables.
 */
export function generarCSVTesoreria(
  registros: Array<{
    dni: string;
    apellidoYNombre: string;
    cbu: string;
    montoCentavos: bigint;
    periodo: string;
  }>,
  config: ConfiguracionCSV = {}
): string {
  const sep = config.separador ?? ";";
  const eol = config.finDeLinea ?? "\r\n";
  const lineas: string[] = [];

  if (config.incluirEncabezado !== false) {
    lineas.push(["DNI", "APELLIDO_Y_NOMBRE", "CBU", "MONTO_PESOS", "PERIODO"].join(sep));
  }

  for (const r of registros) {
    // Conversión de BigInt centavos a pesos con 2 decimales
    const pesos = (Number(r.montoCentavos) / 100).toFixed(2);
    lineas.push(
      [r.dni, `"${r.apellidoYNombre}"`, r.cbu, pesos, r.periodo].join(sep)
    );
  }

  return lineas.join(eol);
}

/**
 * Calcula la actualización del monto respetando el techo presupuestario (ADR-004).
 */
export function calcularMontoActualizado(
  montoBaseCentavos: bigint,
  indiceBase: number,
  indiceActual: number,
  techoPresupuestarioCentavos?: bigint | null
): {
  montoActualizadoCentavos: bigint;
  variacionPorcentaje: number;
  superaTecho: boolean;
} {
  const factor = indiceActual / (indiceBase || 1);
  const variacionPorcentaje = (factor - 1) * 100;
  let montoNuevo = BigInt(Math.round(Number(montoBaseCentavos) * factor));

  let superaTecho = false;
  if (techoPresupuestarioCentavos && montoNuevo > techoPresupuestarioCentavos) {
    superaTecho = true;
  }

  return {
    montoActualizadoCentavos: montoNuevo,
    variacionPorcentaje,
    superaTecho,
  };
}