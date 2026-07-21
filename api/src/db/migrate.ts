import { pool } from "./client.js";

/**
 * Idempotent boot migrator.
 *
 * Runs the full DDL on every boot using IF NOT EXISTS / guarded DO blocks so
 * the container can start against an empty *or* already-migrated database with
 * no journal drift. For iterative schema changes during development you can
 * still diff with `drizzle-kit generate` (see drizzle.config.ts); this file is
 * the source of truth applied at runtime.
 */
const DDL = /* sql */ `
DO $$ BEGIN
  CREATE TYPE difficulty AS ENUM ('facil','moderada','dificil');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE activity AS ENUM ('senderismo','bici','auto','cabalgata','mixto');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE status AS ENUM ('draft','published');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE poi_type AS ENUM (
    'salida','llegada','cultural','naturaleza','mirador','pueblo',
    'cruce','gastronomia','alojamiento','agua','precaucion','interes'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS routes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           text NOT NULL UNIQUE,
  name           text NOT NULL,
  summary        text,
  description    text,
  difficulty     difficulty NOT NULL DEFAULT 'moderada',
  activity       activity   NOT NULL DEFAULT 'senderismo',
  region         text,
  province       text,
  country        text DEFAULT 'AR',
  distance_m     integer DEFAULT 0,
  ascent_m       integer DEFAULT 0,
  descent_m      integer DEFAULT 0,
  duration_min   integer,
  cover_path     text,
  gpx_path       text,
  min_lat        double precision,
  min_lng        double precision,
  max_lat        double precision,
  max_lng        double precision,
  center_lat     double precision,
  center_lng     double precision,
  default_locale text NOT NULL DEFAULT 'es',
  status         status NOT NULL DEFAULT 'draft',
  created_at     timestamp DEFAULT now(),
  updated_at     timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pois (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id         uuid NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  order_index      integer NOT NULL DEFAULT 0,
  distance_m       integer DEFAULT 0,
  type             poi_type NOT NULL DEFAULT 'interes',
  name             text NOT NULL,
  description      text,
  lat              double precision NOT NULL,
  lng              double precision NOT NULL,
  audio_path       text,
  audio_transcript text,
  video_url        text,
  photo_path       text,
  hidden           boolean NOT NULL DEFAULT false,
  created_at       timestamp DEFAULT now(),
  updated_at       timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pois_route_idx ON pois (route_id);

CREATE TABLE IF NOT EXISTS poi_translations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poi_id           uuid NOT NULL REFERENCES pois(id) ON DELETE CASCADE,
  locale           text NOT NULL,
  name             text,
  description      text,
  audio_path       text,
  audio_transcript text
);
CREATE INDEX IF NOT EXISTS poi_tr_uniq ON poi_translations (poi_id, locale);
`;

export async function runMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(DDL);
  } finally {
    client.release();
  }
}
