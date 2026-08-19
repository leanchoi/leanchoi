import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { pois, routes } from "../db/schema.js";
import { requireAdmin } from "../lib/auth.js";
import { getStorage, type StorageFolder } from "../lib/storage.js";
import { parseGpxStats } from "../lib/gpx.js";
import {
  createPoiBody,
  createRouteBody,
  idParam,
  reorderPoisBody,
  updatePoiBody,
  updateRouteBody,
} from "../lib/validation.js";

const storage = getStorage();

interface UploadedFile {
  buffer: Buffer;
  filename: string;
  mimetype: string;
}

/** Read the first file part of a multipart request as a buffer. */
async function firstFile(req: FastifyRequest): Promise<UploadedFile | null> {
  const part = await req.file();
  if (!part) return null;
  const buffer = await part.toBuffer();
  return { buffer, filename: part.filename, mimetype: part.mimetype };
}

function extFor(folder: StorageFolder, mimetype: string): string {
  if (folder === "audio") return "mp3";
  if (folder === "gpx") return "gpx";
  return mimetype.includes("png") ? "png" : "jpg";
}

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  // Guard everything in this plugin scope with the bearer token.
  app.addHook("preHandler", requireAdmin);

  // ─── Reads (all statuses; includes hidden POIs) ────────────
  app.get("/routes", async () => {
    const rows = await db.select().from(routes).orderBy(routes.createdAt);
    return { items: rows };
  });

  app.get("/routes/:id", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const [route] = await db.select().from(routes).where(eq(routes.id, id));
    if (!route) return reply.notFound("Ruta no encontrada");
    const routePois = await db
      .select()
      .from(pois)
      .where(eq(pois.routeId, id))
      .orderBy(pois.orderIndex);
    return { route, pois: routePois };
  });

  // ─── Routes CRUD ───────────────────────────────────────────
  app.post("/routes", async (req, reply) => {
    const body = createRouteBody.parse(req.body);
    try {
      const [row] = await db.insert(routes).values(body).returning();
      return reply.code(201).send(row);
    } catch (err) {
      if (String(err).includes("duplicate key")) {
        return reply.conflict("Ya existe una ruta con ese slug");
      }
      throw err;
    }
  });

  app.patch("/routes/:id", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = updateRouteBody.parse(req.body);

    const patch: Record<string, unknown> = { ...body, updatedAt: new Date() };

    // Si el circuito deja de ser publicable, baja de publicación
    // automáticamente: el estado del Sistema manda sobre la visibilidad.
    if (body.systemState && body.systemState !== "publicable") {
      patch.status = "draft";
    }

    const [row] = await db
      .update(routes)
      .set(patch)
      .where(eq(routes.id, id))
      .returning();
    if (!row) return reply.notFound("Ruta no encontrada");
    return row;
  });

  app.delete("/routes/:id", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const [row] = await db.delete(routes).where(eq(routes.id, id)).returning();
    if (!row) return reply.notFound("Ruta no encontrada");
    // Best-effort cleanup of the GPX/cover on disk.
    if (row.gpxPath) await storage.remove(row.gpxPath);
    if (row.coverPath) await storage.remove(row.coverPath);
    return { ok: true };
  });

  // ─── GPX upload + server-side parse ────────────────────────
  app.post("/routes/:id/gpx", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const [route] = await db.select().from(routes).where(eq(routes.id, id));
    if (!route) return reply.notFound("Ruta no encontrada");

    const file = await firstFile(req);
    if (!file) return reply.badRequest("Falta el archivo GPX");

    const xml = file.buffer.toString("utf-8");
    let stats;
    try {
      stats = parseGpxStats(xml);
    } catch (err) {
      return reply.badRequest(`GPX inválido: ${(err as Error).message}`);
    }

    const gpxPath = await storage.saveBuffer("gpx", `${id}.gpx`, file.buffer);

    const [row] = await db
      .update(routes)
      .set({
        gpxPath,
        distanceM: stats.distanceM,
        ascentM: stats.ascentM,
        descentM: stats.descentM,
        minLat: stats.minLat,
        minLng: stats.minLng,
        maxLat: stats.maxLat,
        maxLng: stats.maxLng,
        centerLat: stats.centerLat,
        centerLng: stats.centerLng,
        updatedAt: new Date(),
      })
      .where(eq(routes.id, id))
      .returning();

    return { route: row, stats };
  });

  // ─── Publish / Unpublish ───────────────────────────────────
  //
  // Regla del Sistema de Montaña: "inventariar no es publicar". Un circuito
  // sólo puede publicarse si su estado dentro del Sistema es `publicable`.
  // La garantía no depende del criterio de quien administra: se aplica acá.
  app.post("/routes/:id/publish", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const [route] = await db.select().from(routes).where(eq(routes.id, id));
    if (!route) return reply.notFound("Ruta no encontrada");

    if (route.systemState !== "publicable") {
      return reply.conflict(
        `No se puede publicar: el circuito está en estado "${route.systemState}". ` +
          `Sólo se publica lo que tiene estado "publicable" dentro del Sistema.`,
      );
    }

    const [row] = await db
      .update(routes)
      .set({ status: "published", updatedAt: new Date() })
      .where(eq(routes.id, id))
      .returning();
    return row;
  });

  app.post("/routes/:id/unpublish", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const [row] = await db
      .update(routes)
      .set({ status: "draft", updatedAt: new Date() })
      .where(eq(routes.id, id))
      .returning();
    if (!row) return reply.notFound("Ruta no encontrada");
    return row;
  });

  // ─── POIs CRUD ─────────────────────────────────────────────
  app.post("/pois", async (req, reply) => {
    const body = createPoiBody.parse(req.body);
    const [row] = await db.insert(pois).values(body).returning();
    return reply.code(201).send(row);
  });

  app.patch("/pois/:id", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = updatePoiBody.parse(req.body);
    const [row] = await db
      .update(pois)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(pois.id, id))
      .returning();
    if (!row) return reply.notFound("POI no encontrado");
    return row;
  });

  app.delete("/pois/:id", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const [row] = await db.delete(pois).where(eq(pois.id, id)).returning();
    if (!row) return reply.notFound("POI no encontrado");
    if (row.audioPath) await storage.remove(row.audioPath);
    if (row.photoPath) await storage.remove(row.photoPath);
    return { ok: true };
  });

  app.post("/pois/reorder", async (req) => {
    const items = reorderPoisBody.parse(req.body);
    if (!items.length) return { ok: true, updated: 0 };
    await db.transaction(async (tx) => {
      for (const it of items) {
        await tx
          .update(pois)
          .set({ orderIndex: it.orderIndex, updatedAt: new Date() })
          .where(eq(pois.id, it.id));
      }
    });
    return { ok: true, updated: items.length };
  });

  // ─── Generic uploads (audio / photo / cover) ───────────────
  const uploadHandler =
    (folder: StorageFolder) =>
    async (req: FastifyRequest, reply: FastifyReply) => {
      const file = await firstFile(req);
      if (!file) return reply.badRequest("Falta el archivo");
      const ext = extFor(folder, file.mimetype);
      const name = `${randomUUID()}.${ext}`;
      const path = await storage.saveBuffer(folder, name, file.buffer);
      return { path };
    };

  app.post("/uploads/audio", uploadHandler("audio"));
  app.post("/uploads/photo", uploadHandler("photos"));
  app.post("/uploads/cover", uploadHandler("covers"));
}
