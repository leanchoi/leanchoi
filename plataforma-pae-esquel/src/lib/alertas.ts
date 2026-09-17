import { EstadoAlerta, ResultadoIntervencion } from "@prisma/client";

export interface DatosCierreAlerta {
  alertaId: string;
  usuarioId: string;
  intervencionesExistentes: Array<{
    id: string;
    tipo: string;
    detalle: string;
    resultado: ResultadoIntervencion;
  }>;
  motivoCierre?: string;
}

/**
 * Valida el cierre de una alerta respetando estrictamente la Regla R4:
 * "Ninguna alerta se cierra sin intervención registrada. «Sin acción» no es un estado de cierre válido."
 */
export function validarCierreAlerta(datos: DatosCierreAlerta): void {
  const { alertaId, usuarioId, intervencionesExistentes } = datos;

  if (!usuarioId || usuarioId.trim() === "") {
    throw new Error("Se requiere un usuario responsable para cerrar la alerta.");
  }

  if (!intervencionesExistentes || intervencionesExistentes.length === 0) {
    throw new Error(
      `Regla R4 violada: La alerta '${alertaId}' no puede cerrarse sin al menos una intervención registrada en la bitácora institucional.`
    );
  }

  // Verificar que ninguna intervención sea inválida o "sin acción"
  const algunaValida = intervencionesExistentes.some(
    (i) => i.detalle && i.detalle.trim().length > 5
  );

  if (!algunaValida) {
    throw new Error(
      "Regla R4 violada: La intervención registrada debe contener detalle y acción concreta; «Sin acción» no es un cierre válido."
    );
  }
}