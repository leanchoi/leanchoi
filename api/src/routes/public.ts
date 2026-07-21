import type { FastifyInstance } from "fastify";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { pois, poiTranslations, routes } from "../db/schema.js";
import {
  listRoutesQuery,
  localeQuery,
  slugParam,
} from "../lib/validation.js";
import {
  toPoiDTO,
  toRouteCard,
  toRouteDetail,
  type PoiDTO,
} from "../lib/dto.js";

export async function publicRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => ({ ok: true }));

  // ─── List published routes (filterable, paginated) ─────────
  app.get("/routes", async (req) => {
    const q = listRoutesQuery.parse(req.query);

    const filters = [eq(routes.status, "published")];
    if (q.q) {
      const like = `%${q.q}%`;
      filters.push(
        or(ilike(routes.name, like), ilike(routes.summary, like))!,
      );
    }
    if (q.difficulty) filters.push(eq(routes.difficulty, q.difficulty));
    if (q.activity) filters.push(eq(routes.activity, q.activity));
    if (q.region) filters.push(ilike(routes.region, `%${q.region}%`));

    const where = and(...filters);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(routes)
      .where(where);

    const items = await db
      .select()
      .from(routes)
      .where(where)
      .orderBy(desc(routes.createdAt))
      .limit(q.limit)
      .offset((q.page - 1) * q.limit);

    return {
      items: items.map(toRouteCard),
      total: count,
      page: q.page,
      limit: q.limit,
    };
  });

  // ─── Full route detail by slug (localized POIs) ────────────
  app.get("/routes/:slug", async (req, reply) => {
    const { slug } = slugParam.parse(req.params);
    const { locale } = localeQuery.parse(req.query);

    const [route] = await db
      .select()
      .from(routes)
      .where(and(eq(routes.slug, slug), eq(routes.status, "published")))
      .limit(1);

    if (!route) return reply.notFound("Ruta no encontrada");

    const wantLocale = locale ?? route.defaultLocale;

    const rows = await db
      .select()
      .from(pois)
      .where(and(eq(pois.routeId, route.id), eq(pois.hidden, false)))
      .orderBy(pois.orderIndex);

    // Load translations for the requested locale in one query.
    const poiIds = rows.map((p) => p.id);
    const translations =
      poiIds.length && wantLocale !== route.defaultLocale
        ? await db
            .select()
            .from(poiTranslations)
            .where(
              and(
                eq(poiTranslations.locale, wantLocale),
                sql`${poiTranslations.poiId} = ANY(${poiIds})`,
              ),
            )
        : [];

    const byPoi = new Map(translations.map((t) => [t.poiId, t]));

    const dtos: PoiDTO[] = rows.map((p) => toPoiDTO(p, byPoi.get(p.id)));

    return toRouteDetail(route, dtos);
  });
}
