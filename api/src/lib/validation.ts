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
