import { prisma } from "@/lib/prisma";

export interface ParametrosAuditoria {
  usuarioId?: string | null;
  accion: string;
  entidad: string;
  entidadId?: string | null;
  detalle?: Record<string, any>;
  ip?: string | null;
}

export interface ParametrosAccesoDato {
  personaId: string;
  usuarioId: string;
  motivo: string;
  seccion: string;
}

/**
 * Bitácora inmutable (M10): Solo inserción.
 * Nadie puede modificar ni borrar estos registros.
 */
export async function registrarEventoAuditoria(params: ParametrosAuditoria): Promise<void> {
  try {
    await prisma.eventoAuditoria.create({
      data: {
        usuarioId: params.usuarioId ?? null,
        accion: params.accion,
        entidad: params.entidad,
        entidadId: params.entidadId ?? null,
        detalle: params.detalle ?? undefined,
        ip: params.ip ?? null,
      },
    });
  } catch (error) {
    // Si falla la auditoría, se reporta en consola para trazabilidad
    console.error("Error al persistir EventoAuditoria:", error);
  }
}

/**
 * Principio estonio (M10): El titular ve quién consultó sus datos personales.
 */
export async function registrarAccesoDato(params: ParametrosAccesoDato): Promise<void> {
  try {
    await prisma.accesoDato.create({
      data: {
        personaId: params.personaId,
        usuarioId: params.usuarioId,
        motivo: params.motivo,
        seccion: params.seccion,
      },
    });
  } catch (error) {
    console.error("Error al persistir AccesoDato:", error);
  }
}