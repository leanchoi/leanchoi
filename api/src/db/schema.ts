import {
  pgTable,
  uuid,
  text,
  integer,
  doublePrecision,
  boolean,
  timestamp,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";

export const difficultyEnum = pgEnum("difficulty", [
  "facil",
  "moderada",
  "dificil",
]);
export const activityEnum = pgEnum("activity", [
  "senderismo",
  "bici",
  "auto",
  "cabalgata",
  "mixto",
]);
export const statusEnum = pgEnum("status", ["draft", "published"]);

/**
 * Estado del circuito dentro del Sistema de Montaña (documento de trabajo,
 * "Cómo se construye el inventario"). Es independiente de `status`:
 * inventariar no es publicar. Sólo un circuito `publicable` puede pasar a
 * `status = published` (se valida en la API).
 */
export const systemStateEnum = pgEnum("system_state", [
  "relevado",
  "en_gestion_de_acuerdo",
  "publicable",
  "uso_local_no_difundible",
  "suspendido",
]);

/** Situación del suelo que atraviesa el circuito (cuadro del documento). */
export const soilSituationEnum = pgEnum("soil_situation", [
  "publico",
  "privado_con_acuerdo",
  "privado_sin_acuerdo",
  "titularidad_en_definicion",
  "provincial_o_nacional",
]);
export const poiTypeEnum = pgEnum("poi_type", [
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
]);

export const routes = pgTable("routes", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  summary: text("summary"),
  description: text("description"),
  difficulty: difficultyEnum("difficulty").notNull().default("moderada"),
  activity: activityEnum("activity").notNull().default("senderismo"),
  region: text("region"),
  province: text("province"),
  country: text("country").default("AR"),
  distanceM: integer("distance_m").default(0),
  ascentM: integer("ascent_m").default(0),
  descentM: integer("descent_m").default(0),
  durationMin: integer("duration_min"),
  coverPath: text("cover_path"),
  gpxPath: text("gpx_path"),
  minLat: doublePrecision("min_lat"),
  minLng: doublePrecision("min_lng"),
  maxLat: doublePrecision("max_lat"),
  maxLng: doublePrecision("max_lng"),
  centerLat: doublePrecision("center_lat"),
  centerLng: doublePrecision("center_lng"),
  defaultLocale: text("default_locale").notNull().default("es"),
  status: statusEnum("status").notNull().default("draft"),

  // ─── Ficha mínima del Sistema de Montaña ───────────────────
  systemState: systemStateEnum("system_state").notNull().default("relevado"),
  soilSituation: soilSituationEnum("soil_situation"),
  /** Nombres alternativos con que se conoce el circuito. */
  altNames: text("alt_names"),
  /** Punto de inicio y acceso descripto. */
  accessDescription: text("access_description"),
  compatibleUses: text("compatible_uses"),
  incompatibleUses: text("incompatible_uses"),
  seasonality: text("seasonality"),
  risks: text("risks"),
  conservationState: text("conservation_state"),
  maintainedBy: text("maintained_by"),
  /** Antecedentes: apertura, uso histórico, valor cultural o deportivo. */
  background: text("background"),
  /** Autoría del aporte (principio 2: todo aporte lleva el nombre). */
  contributedBy: text("contributed_by"),
  reviewedBy: text("reviewed_by"),
  /** Nota interna de gestión (no se publica). */
  managementNotes: text("management_notes"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const pois = pgTable(
  "pois",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    routeId: uuid("route_id")
      .notNull()
      .references(() => routes.id, { onDelete: "cascade" }),
    orderIndex: integer("order_index").notNull().default(0),
    distanceM: integer("distance_m").default(0),
    type: poiTypeEnum("type").notNull().default("interes"),
    name: text("name").notNull(),
    description: text("description"),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    audioPath: text("audio_path"),
    audioTranscript: text("audio_transcript"),
    videoUrl: text("video_url"),
    photoPath: text("photo_path"),
    hidden: boolean("hidden").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => ({ byRoute: index("pois_route_idx").on(t.routeId) }),
);

export const poiTranslations = pgTable(
  "poi_translations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    poiId: uuid("poi_id")
      .notNull()
      .references(() => pois.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    name: text("name"),
    description: text("description"),
    audioPath: text("audio_path"),
    audioTranscript: text("audio_transcript"),
  },
  (t) => ({ uniq: index("poi_tr_uniq").on(t.poiId, t.locale) }),
);

export type Route = typeof routes.$inferSelect;
export type NewRoute = typeof routes.$inferInsert;
export type Poi = typeof pois.$inferSelect;
export type NewPoi = typeof pois.$inferInsert;
export type PoiTranslation = typeof poiTranslations.$inferSelect;
