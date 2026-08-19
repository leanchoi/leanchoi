import { z } from "zod";

export const difficultyValues = ["facil", "moderada", "dificil"] as const;
export const activityValues = [
  "senderismo",
  "bici",
  "auto",
  "cabalgata",
  "mixto",
] as const;
export const poiTypeValues = [
  "salida",
  "llegada",
  "cultural",
  "naturaleza",
  "mirador",
  "pueblo",
  "cruce",
  "gastronomia",
  "alojamiento",
  "agua",
  "precaucion",
  "interes",
] as const;
export const localeValues = ["es", "en", "cy"] as const;

/** Estado del circuito dentro del Sistema de Montaña. */
export const systemStateValues = [
  "relevado",
  "en_gestion_de_acuerdo",
  "publicable",
  "uso_local_no_difundible",
  "suspendido",
] as const;

/** Situación del suelo que atraviesa el circuito. */
export const soilSituationValues = [
  "publico",
  "privado_con_acuerdo",
  "privado_sin_acuerdo",
  "titularidad_en_definicion",
  "provincial_o_nacional",
] as const;

/** kebab-case, url-safe slug */
const slugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug inválido (usar kebab-case)");

// ─── Query params ────────────────────────────────────────────
export const listRoutesQuery = z.object({
  q: z.string().trim().max(200).optional(),
  difficulty: z.enum(difficultyValues).optional(),
  activity: z.enum(activityValues).optional(),
  region: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(48).default(12),
});
export type ListRoutesQuery = z.infer<typeof listRoutesQuery>;

export const localeQuery = z.object({
  locale: z.enum(localeValues).optional(),
});

export const slugParam = z.object({ slug: slugSchema });
export const idParam = z.object({ id: z.string().uuid() });

// ─── Route body ──────────────────────────────────────────────
/** Campo de texto libre de la ficha (opcional, admite vaciarlo con null). */
const fichaText = z.string().max(5000).nullable().optional();

export const createRouteBody = z.object({
  slug: slugSchema,
  name: z.string().min(1).max(200),
  summary: z.string().max(500).optional(),
  description: z.string().max(20000).optional(),
  difficulty: z.enum(difficultyValues).default("moderada"),
  activity: z.enum(activityValues).default("senderismo"),
  region: z.string().max(200).optional(),
  province: z.string().max(200).optional(),
  country: z.string().max(4).optional(),
  durationMin: z.number().int().min(0).max(100000).nullable().optional(),
  coverPath: z.string().max(300).nullable().optional(),
  defaultLocale: z.enum(localeValues).default("es"),

  // ─── Ficha mínima del Sistema de Montaña ───────────────────
  systemState: z.enum(systemStateValues).default("relevado"),
  soilSituation: z.enum(soilSituationValues).nullable().optional(),
  altNames: fichaText,
  accessDescription: fichaText,
  compatibleUses: fichaText,
  incompatibleUses: fichaText,
  seasonality: fichaText,
  risks: fichaText,
  conservationState: fichaText,
  maintainedBy: fichaText,
  background: fichaText,
  contributedBy: fichaText,
  reviewedBy: fichaText,
  managementNotes: fichaText,
});
export type CreateRouteBody = z.infer<typeof createRouteBody>;

export const updateRouteBody = createRouteBody.partial();
export type UpdateRouteBody = z.infer<typeof updateRouteBody>;

// ─── POI body ────────────────────────────────────────────────
export const createPoiBody = z.object({
  routeId: z.string().uuid(),
  type: z.enum(poiTypeValues).default("interes"),
  name: z.string().min(1).max(200),
  description: z.string().max(20000).nullable().optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  orderIndex: z.number().int().min(0).optional(),
  distanceM: z.number().int().min(0).nullable().optional(),
  audioPath: z.string().max(300).nullable().optional(),
  audioTranscript: z.string().max(20000).nullable().optional(),
  videoUrl: z.string().url().max(500).nullable().optional(),
  photoPath: z.string().max(300).nullable().optional(),
  hidden: z.boolean().optional(),
});
export type CreatePoiBody = z.infer<typeof createPoiBody>;

export const updatePoiBody = createPoiBody.omit({ routeId: true }).partial();
export type UpdatePoiBody = z.infer<typeof updatePoiBody>;

export const reorderPoisBody = z
  .array(
    z.object({
      id: z.string().uuid(),
      orderIndex: z.number().int().min(0),
    }),
  )
  .max(1000);
export type ReorderPoisBody = z.infer<typeof reorderPoisBody>;
