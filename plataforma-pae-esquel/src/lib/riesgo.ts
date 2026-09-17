import { Severidad, TipoAlerta } from "@prisma/client";

// Variables permitidas estrictamente tipadas para el motor de riesgo (Regla R6)
export interface FactoresRiesgoPermitidos {
  diasRegularidadVencida?: number; // M2
  materiasAdeudadas?: number; // M2
  umbralMateriasNivel?: number; // M2
  porcentajeHorasCumplidas?: number; // M3 (ej: 45 para 45%)
  inasistenciasConsecutivas?: number; // M3
  diasSinContacto?: number; // M1 / M7
  cambioIngresosHogarReportado?: boolean; // M1
  rechazoBancario?: boolean; // M5
  trayectoriaDescendente?: boolean; // M2
  derivacionAreaSocial?: boolean; // Interoperabilidad
}

// Variables prohibidas por la Regla R6
export const VARIABLES_PROHIBIDAS_R6 = [
  "nacionalidad",
  "origenEtnico",
  "salud",
  "discapacidad",
  "religion",
  "opinionPolitica",
  "afiliacionSindical",
  "situacionPenalFamiliares",
  "barrio", // El barrio se usa para asignación territorial, NUNCA para puntuar personas
  "domicilio",
] as const;

export interface ItemDesglose {
  senal: string;
  tipoAlerta: TipoAlerta;
  aporte: number;
  descripcion: string;
}

export interface ResultadoRiesgo {
  puntajeTotal: number;
  severidad: Severidad;
  desglose: ItemDesglose[]; // Regla R8: desglose obligatorio y no vacío si hay riesgo
  vencimientoSlaHoras: number;
}

/**
 * Valida que un objeto de datos no contenga variables prohibidas (Regla R6).
 */
export function validarVariablesProhibidas(objeto: Record<string, any>): void {
  for (const varProhibida of VARIABLES_PROHIBIDAS_R6) {
    if (varProhibida in objeto && objeto[varProhibida] !== undefined) {
      throw new Error(
        `Regla R6 violada: La variable '${varProhibida}' está expresamente prohibida en el motor de riesgo individual.`
      );
    }
  }
}

/**
 * Calcula el puntaje de riesgo de forma transparente, explicable y reproducible (ADR-001).
 * Regla R8: Siempre devuelve el desglose de señales.
 */
export function calcularRiesgo(
  factores: FactoresRiesgoPermitidos,
  payloadCrudoParaAuditar?: Record<string, any>
): ResultadoRiesgo {
  if (payloadCrudoParaAuditar) {
    validarVariablesProhibidas(payloadCrudoParaAuditar);
  }

  const desglose: ItemDesglose[] = [];
  let puntaje = 0;

  // 1. Regularidad vencida (>15 días)
  if (factores.diasRegularidadVencida && factores.diasRegularidadVencida > 15) {
    const aporte = Math.min(40, 20 + (factores.diasRegularidadVencida - 15) * 2);
    puntaje += aporte;
    desglose.push({
      senal: "Regularidad académica vencida",
      tipoAlerta: TipoAlerta.REGULARIDAD_VENCIDA,
      aporte,
      descripcion: `Regularidad vencida hace ${factores.diasRegularidadVencida} días (+${aporte})`,
    });
  }

  // 2. Caída de rendimiento académico
  if (
    factores.materiasAdeudadas != null &&
    factores.umbralMateriasNivel != null &&
    factores.materiasAdeudadas > factores.umbralMateriasNivel
  ) {
    const aporte = 30;
    puntaje += aporte;
    desglose.push({
      senal: "Caída de rendimiento académico",
      tipoAlerta: TipoAlerta.RENDIMIENTO_EN_CAIDA,
      aporte,
      descripcion: `Adeuda ${factores.materiasAdeudadas} materias (supera umbral de ${factores.umbralMateriasNivel}) (+${aporte})`,
    });
  }

  // 3. Horas comunitarias atrasadas (<60% del avance esperado)
  if (
    factores.porcentajeHorasCumplidas != null &&
    factores.porcentajeHorasCumplidas < 60
  ) {
    const aporte = 25;
    puntaje += aporte;
    desglose.push({
      senal: "Atraso en horas comunitarias",
      tipoAlerta: TipoAlerta.HORAS_ATRASADAS,
      aporte,
      descripcion: `Cumplimiento de horas al ${factores.porcentajeHorasCumplidas}% sobre lo esperado (+${aporte})`,
    });
  }

  // 4. Inasistencias consecutivas (>= 2)
  if (
    factores.inasistenciasConsecutivas &&
    factores.inasistenciasConsecutivas >= 2
  ) {
    const aporte = 20;
    puntaje += aporte;
    desglose.push({
      senal: "Inasistencias a actividad comunitaria",
      tipoAlerta: TipoAlerta.INASISTENCIA,
      aporte,
      descripcion: `${factores.inasistenciasConsecutivas} faltas consecutivas sin previo aviso (+${aporte})`,
    });
  }

  // 5. Sin contacto efectivo (>45 días)
  if (factores.diasSinContacto && factores.diasSinContacto > 45) {
    const aporte = 20;
    puntaje += aporte;
    desglose.push({
      senal: "Falta de contacto efectivo",
      tipoAlerta: TipoAlerta.SIN_CONTACTO,
      aporte,
      descripcion: `Sin interacción registrada hace ${factores.diasSinContacto} días (+${aporte})`,
    });
  }

  // 6. Rechazo bancario
  if (factores.rechazoBancario) {
    const aporte = 35;
    puntaje += aporte;
    desglose.push({
      senal: "Rechazo bancario del pago",
      tipoAlerta: TipoAlerta.RECHAZO_BANCARIO,
      aporte,
      descripcion: `Se registró un rechazo bancario en la última acreditación (+${aporte})`,
    });
  }

  // 7. Derivación de otra área municipal
  if (factores.derivacionAreaSocial) {
    const aporte = 50;
    puntaje += aporte;
    desglose.push({
      senal: "Alerta derivada de Desarrollo Humano",
      tipoAlerta: TipoAlerta.DERIVACION_OTRA_AREA,
      aporte,
      descripcion: `Informe social recibido solicitando acompañamiento urgente (+${aporte})`,
    });
  }

  // Determinar severidad y SLA según puntaje
  let severidad: Severidad = Severidad.INFORMATIVA;
  let vencimientoSlaHoras = 240; // 10 días hábiles

  if (puntaje >= 70 || factores.derivacionAreaSocial) {
    severidad = Severidad.CRITICA;
    vencimientoSlaHoras = 24; // 24 horas
  } else if (puntaje >= 45) {
    severidad = Severidad.ALTA;
    vencimientoSlaHoras = 48; // 48 horas
  } else if (puntaje >= 20) {
    severidad = Severidad.MEDIA;
    vencimientoSlaHoras = 120; // 5 días hábiles
  }

  return {
    puntajeTotal: puntaje,
    severidad,
    desglose,
    vencimientoSlaHoras,
  };
}