import { z } from 'zod';
import { MOTIVOS_NO_RESPUESTA } from '@/lib/campo/tipos';

/**
 * Lo que el celular manda al servidor. Se valida acá con el mismo Zod que usa el
 * cliente: nada entra a la base sin pasar por este filtro.
 */

const ubicacion = z
  .object({
    lat: z.number(),
    lng: z.number(),
    precisionM: z.number(),
    tomadaEn: z.string(),
  })
  .nullable()
  .optional();

export const EncuestaEntranteSchema = z.object({
  ticket: z.uuid(),
  viviendaId: z.uuid(),
  barrioId: z.uuid(),
  cuestionarioVersion: z.number().int().min(1),
  /** Regla 2: sin esto la encuesta no entra. */
  consentimientoVersion: z.string().min(1, 'Falta el consentimiento del vecino.'),
  respuestas: z.record(z.string(), z.unknown()),
  abiertaEn: z.string(),
  cerradaEn: z.string().nullable(),
  duracionSegundos: z.number().int().nullable().optional(),
  gpsApertura: ubicacion,
  gpsCierre: ubicacion,
  dispositivoId: z.string().min(1),
});

export const NoRespuestaEntranteSchema = z.object({
  id: z.uuid(),
  viviendaId: z.uuid(),
  barrioId: z.uuid(),
  motivo: z.enum(MOTIVOS_NO_RESPUESTA),
  intento: z.number().int().min(1),
  observacion: z.string().max(500).optional().default(''),
  gps: ubicacion,
  registradaEn: z.string(),
  dispositivoId: z.string().min(1),
});

export const ViviendaEntranteSchema = z.object({
  id: z.uuid(),
  barrioId: z.uuid(),
  identificador: z.string().min(1).max(120),
});

export const ContactoEntranteSchema = z.object({
  ticket: z.uuid(),
  nombre: z.string().min(1).max(120),
  apellido: z.string().min(1).max(120),
  dniUltimos: z.string().regex(/^\d{3}$/, 'Son los últimos 3 números del DNI.'),
  email: z.string().max(200).optional().nullable(),
  telefono: z.string().max(60).optional().nullable(),
  domicilio: z.string().min(1).max(300),
  barrioNombre: z.string().min(1).max(120),
});

export const TIPOS_EVENTO = ['encuesta', 'no_respuesta', 'vivienda_nueva', 'contacto'] as const;

export const EventoEntranteSchema = z.object({
  id: z.string().min(1).max(200),
  ticket: z.string().min(1).max(200),
  tipo: z.enum(TIPOS_EVENTO),
  payload: z.unknown(),
  creadoEn: z.string(),
});

export const LoteSchema = z.object({
  eventos: z.array(EventoEntranteSchema).min(1).max(100),
});

export type EventoEntrante = z.infer<typeof EventoEntranteSchema>;
export type Lote = z.infer<typeof LoteSchema>;
