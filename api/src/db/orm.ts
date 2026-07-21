// Re-export the drizzle query helpers the seed needs through a module that
// lives *inside* api/src. The seed script sits in db/seed (outside api/), so
// importing this relatively lets Node/tsx resolve drizzle from api/node_modules
// without any node_modules symlink gymnastics.
export { eq, and, or, sql } from "drizzle-orm";
