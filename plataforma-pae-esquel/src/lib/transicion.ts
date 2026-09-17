import { EstadoPostulacion } from "@prisma/client";

export interface ParametrosTransicion {
  postulacionId: string;
  desde?: EstadoPostulacion | null;
  hacia: EstadoPostulacion;
  motivo: string;
  fundamento?: string;
  usuarioId?: string | null;
}

// Estados terminales o sancionatorios que NUNCA pueden ser automáticos (Regla R1)
export const ESTADOS_DECISION_HUMANA_OBLIGATORIA: EstadoPostulacion[] = [
  EstadoPostulacion.SUSPENDIDA,
  EstadoPostulacion.BAJA,
  EstadoPostulacion.RECHAZADA,
];

/**
 * Valida la transición de estado cumpliendo estrictamente con R1:
 * "El sistema nunca da de baja, rechaza ni suspende a nadie de forma automática.
 * Detecta, prioriza, asigna y recuerda. Una persona decide y firma."
 */
export function validarTransicionEstado(params: ParametrosTransicion): void {
  const { hacia, usuarioId } = params;

  if (ESTADOS_DECISION_HUMANA_OBLIGATORIA.includes(hacia)) {
    if (!usuarioId || typeof usuarioId !== "string" || usuarioId.trim() === "") {
      throw new Error(
        `Regla R1 violada: La transición al estado '${hacia}' es terminal o sancionatoria y requiere obligatoriamente una firma y decisión humana con 'usuarioId' válido.`
      );
    }
  }

  if (!params.motivo || params.motivo.trim() === "") {
    throw new Error("Toda transición de estado debe registrar un motivo explícito.");
  }
}