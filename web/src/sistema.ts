import type { SoilSituation, SystemState } from "./api.js";

/**
 * Etiquetas y colores de la ficha del Sistema de Montaña, según el documento
 * de trabajo de la Subsecretaría de Turismo de Esquel.
 */

export const SYSTEM_STATES: Record<
  SystemState,
  { label: string; color: string; help: string; publishable: boolean }
> = {
  relevado: {
    label: "Relevado",
    color: "#6b7280",
    help: "Registrado en el inventario. Todavía no se define su publicación.",
    publishable: false,
  },
  en_gestion_de_acuerdo: {
    label: "En gestión de acuerdo",
    color: "#d97706",
    help: "Se está gestionando el acuerdo de acceso con los titulares.",
    publishable: false,
  },
  publicable: {
    label: "Publicable",
    color: "#16a34a",
    help: "Tiene acuerdo y puede difundirse públicamente.",
    publishable: true,
  },
  uso_local_no_difundible: {
    label: "Uso local no difundible",
    color: "#7c3aed",
    help: "Consta en el inventario pero no se difunde, a pedido de quienes lo aportaron o por razones ambientales, culturales, productivas o de seguridad.",
    publishable: false,
  },
  suspendido: {
    label: "Suspendido",
    color: "#dc2626",
    help: "Fuera de circulación hasta que cambien las condiciones.",
    publishable: false,
  },
};

export const SOIL_SITUATIONS: Record<
  SoilSituation,
  { label: string; publishRule: string }
> = {
  publico: {
    label: "Dominio público, fiscal municipal o camino vecinal",
    publishRule: "Se publica.",
  },
  privado_con_acuerdo: {
    label: "Privado con acuerdo",
    publishRule: "Se publica con las condiciones acordadas a la vista.",
  },
  privado_sin_acuerdo: {
    label: "Privado sin acuerdo o sin contacto establecido",
    publishRule: "No se publica.",
  },
  titularidad_en_definicion: {
    label: "Titularidad en proceso de definición",
    publishRule: "No se publica.",
  },
  provincial_o_nacional: {
    label: "Jurisdicción provincial o nacional",
    publishRule: "Según lo que establezca la autoridad de aplicación.",
  },
};

export const SYSTEM_STATE_LIST = Object.keys(SYSTEM_STATES) as SystemState[];
export const SOIL_SITUATION_LIST = Object.keys(
  SOIL_SITUATIONS,
) as SoilSituation[];
