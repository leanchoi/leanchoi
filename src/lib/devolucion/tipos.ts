import type { Competencia } from './plantillas';

/**
 * Tipos y etiquetas de las derivaciones, sin nada del servidor adentro: los usa
 * tanto el panel (en el navegador) como el módulo que habla con la base.
 */

export const ESTADOS_DERIVACION = [
  'recibida',
  'derivada',
  'en_proceso',
  'resuelta',
  'fuera_de_competencia',
] as const;

export type EstadoDerivacion = (typeof ESTADOS_DERIVACION)[number];

export const ETIQUETA_ESTADO: Record<EstadoDerivacion, string> = {
  recibida: 'Recibida',
  derivada: 'Derivada',
  en_proceso: 'En proceso',
  resuelta: 'Resuelta',
  fuera_de_competencia: 'Fuera de competencia municipal',
};

export type Derivacion = {
  id: string;
  ticket: string;
  barrioId: string;
  barrioNombre: string;
  competencia: Competencia;
  areaDestino: string;
  descripcion: string;
  estado: EstadoDerivacion;
  ordenTrabajoNro: string | null;
  creadaEn: Date;
  actualizadaEn: Date;
};
