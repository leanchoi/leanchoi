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
