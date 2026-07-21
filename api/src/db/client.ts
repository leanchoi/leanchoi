import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
import * as schema from "./schema.js";

const { Pool } = pkg;

const connectionString =
  process.env.DATABASE_URL ??
  "postgres://rutas:rutas@localhost:5432/rutas";

export const pool = new Pool({ connectionString });

export const db = drizzle(pool, { schema });

export type Db = typeof db;
