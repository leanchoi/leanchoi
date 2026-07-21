import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import sensible from "@fastify/sensible";
import path from "node:path";
import { promises as fs } from "node:fs";
import { ZodError } from "zod";
import { runMigrations } from "./db/migrate.js";
import { publicRoutes } from "./routes/public.js";
import { adminRoutes } from "./routes/admin.js";

const PORT = Number(process.env.API_PORT ?? 8080);
const STORAGE_DIR = process.env.STORAGE_DIR ?? "/storage";

async function main(): Promise<void> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      transport:
        process.env.NODE_ENV === "production"
          ? undefined
          : { target: "pino-pretty" },
    },
    bodyLimit: 5 * 1024 * 1024, // 5 MB JSON
  });

  await app.register(sensible);
  // Single-origin in prod (nginx proxy). CORS kept permissive for local dev.
  await app.register(cors, { origin: true });
  await app.register(multipart, {
    limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB per upload (audio/photo/gpx)
  });

  // Ensure storage tree exists, then serve it under /files/*.
  for (const sub of ["gpx", "audio", "photos", "covers"]) {
    await fs.mkdir(path.join(STORAGE_DIR, sub), { recursive: true });
  }
  await app.register(fastifyStatic, {
    root: STORAGE_DIR,
    prefix: "/files/",
    decorateReply: false,
  });

  // Uniform Zod validation errors -> 400.
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: "Datos inválidos",
        issues: err.issues,
      });
    }
    if (err.validation) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: err.message,
      });
    }
    reply.log.error(err);
    return reply.status(err.statusCode ?? 500).send({
      statusCode: err.statusCode ?? 500,
      error: err.name ?? "Internal Server Error",
      message: err.message,
    });
  });

  await app.register(publicRoutes, { prefix: "/api" });
  await app.register(adminRoutes, { prefix: "/api/admin" });

  // Run migrations before accepting traffic.
  app.log.info("Ejecutando migraciones…");
  await runMigrations();
  app.log.info("Migraciones OK");

  await app.listen({ port: PORT, host: "0.0.0.0" });
  app.log.info(`API escuchando en :${PORT}`);
}

main().catch((err) => {
  console.error("Fallo al iniciar la API:", err);
  process.exit(1);
});
