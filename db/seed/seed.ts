/**
 * Seed the demo route "Sendero Esquel – Trevelin".
 *
 * Builds a synthetic GPX from real anchor coordinates, saves it through the
 * same StorageDriver the API uses, runs the real §4.1 parser to populate
 * stats/bbox/center, and inserts 7 POIs with varied types (Spanish content).
 *
 * Run inside the container:  docker compose exec api npm run seed
 * Idempotent: re-running replaces the demo route.
 */
import { eq } from "../../api/src/db/orm.js";
import { db, pool } from "../../api/src/db/client.js";
import { pois, routes } from "../../api/src/db/schema.js";
import { runMigrations } from "../../api/src/db/migrate.js";
import { getStorage } from "../../api/src/lib/storage.js";
import { parseGpxStats } from "../../api/src/lib/gpx.js";

const SLUG = "sendero-esquel-trevelin";

interface Pt {
  lat: number;
  lng: number;
  ele: number;
}

/** Linear interpolation of coordinates + elevation between two anchors. */
function interpolate(
  a: { lat: number; lng: number; ele: number },
  b: { lat: number; lng: number; ele: number },
  steps: number,
  includeLast: boolean,
): Pt[] {
  const out: Pt[] = [];
  const last = includeLast ? steps : steps - 1;
  for (let i = 0; i <= last; i++) {
    const t = i / steps;
    // A little deterministic elevation ripple so ascent/descent are non-trivial.
    const ripple = Math.sin(t * Math.PI * 3) * 12;
    out.push({
      lat: a.lat + (b.lat - a.lat) * t,
      lng: a.lng + (b.lng - a.lng) * t,
      ele: Math.round(a.ele + (b.ele - a.ele) * t + ripple),
    });
  }
  return out;
}

function buildGpx(points: Pt[]): string {
  const trkpts = points
    .map(
      (p) =>
        `      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lng.toFixed(
          6,
        )}"><ele>${p.ele}</ele></trkpt>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="esquel-rutas-seed" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>Sendero Esquel – Trevelin</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;
}

async function main(): Promise<void> {
  await runMigrations();
  const storage = getStorage();

  // Real anchors: Esquel centro → zona La Hoya → Trevelin.
  const esquel = { lat: -42.9086, lng: -71.3103, ele: 560 };
  const laHoya = { lat: -42.83, lng: -71.35, ele: 940 };
  const trevelin = { lat: -43.0876, lng: -71.4595, ele: 520 };

  const track: Pt[] = [
    ...interpolate(esquel, laHoya, 10, false),
    ...interpolate(laHoya, trevelin, 10, true),
  ];

  const gpxXml = buildGpx(track);
  const stats = parseGpxStats(gpxXml);

  // Replace any previous demo route (cascade removes its POIs).
  await db.delete(routes).where(eq(routes.slug, SLUG));

  const [route] = await db
    .insert(routes)
    .values({
      slug: SLUG,
      name: "Sendero Esquel – Trevelin",
      summary:
        "Recorrido escénico por la Comarca Los Alerces, de Esquel a Trevelin pasando por la zona de La Hoya.",
      description: `## Sendero Esquel – Trevelin

Una ruta **moderada** de montaña que conecta la ciudad de **Esquel** con el
pueblo de raíces galesas de **Trevelin**, atravesando paisajes de estepa,
bosque andino patagónico y miradores con vista a la cordillera.

- Punto de partida: centro de Esquel
- Punto de llegada: Trevelin (Casa de té galesa)
- Mejor época: primavera y verano

> Ruta de demostración con datos sintéticos. Editá todo desde \`/admin\`.`,
      difficulty: "moderada",
      activity: "senderismo",
      region: "Comarca Los Alerces",
      province: "Chubut",
      country: "AR",
      durationMin: 240,
      defaultLocale: "es",
      status: "published",
      distanceM: stats.distanceM,
      ascentM: stats.ascentM,
      descentM: stats.descentM,
      minLat: stats.minLat,
      minLng: stats.minLng,
      maxLat: stats.maxLat,
      maxLng: stats.maxLng,
      centerLat: stats.centerLat,
      centerLng: stats.centerLng,
    })
    .returning();

  const gpxPath = await storage.saveBuffer("gpx", `${route.id}.gpx`, gpxXml);
  await db.update(routes).set({ gpxPath }).where(eq(routes.id, route.id));

  const demoPois = [
    {
      type: "salida" as const,
      name: "Esquel — Plaza San Martín",
      description:
        "Punto de partida en el corazón de Esquel. Aprovisionate acá antes de salir.",
      lat: -42.9086,
      lng: -71.3103,
    },
    {
      type: "mirador" as const,
      name: "Mirador de La Hoya",
      description:
        "Vista panorámica del valle y del cerro La Hoya, centro de esquí en invierno.",
      lat: -42.848,
      lng: -71.346,
    },
    {
      type: "naturaleza" as const,
      name: "Bosque de Alerces",
      description:
        "Sector de bosque andino patagónico con ejemplares centenarios de alerce.",
      lat: -42.9,
      lng: -71.39,
    },
    {
      type: "agua" as const,
      name: "Arroyo Esquel",
      description: "Punto de agua sobre el arroyo. Verificá potabilidad antes de consumir.",
      lat: -42.97,
      lng: -71.41,
    },
    {
      type: "cultural" as const,
      name: "Capilla galesa",
      description:
        "Capilla de la colonia galesa, testimonio de la inmigración del siglo XIX en el valle.",
      lat: -43.08,
      lng: -71.455,
    },
    {
      type: "gastronomia" as const,
      name: "Casa de té galesa",
      description:
        "Clásica casa de té de Trevelin: torta negra galesa y té a la usanza de la colonia.",
      lat: -43.086,
      lng: -71.458,
    },
    {
      type: "llegada" as const,
      name: "Trevelin — Plaza Coronel Fontana",
      description: "Fin del recorrido en el centro de Trevelin.",
      lat: -43.0876,
      lng: -71.4595,
    },
  ];

  await db.insert(pois).values(
    demoPois.map((p, i) => ({
      routeId: route.id,
      orderIndex: i,
      ...p,
    })),
  );

  console.log(
    `Seed OK: "${route.name}" (${SLUG})\n` +
      `  distancia=${stats.distanceM} m  ⬆${stats.ascentM} m  ⬇${stats.descentM} m\n` +
      `  bbox=[${stats.minLat.toFixed(4)},${stats.minLng.toFixed(
        4,
      )} .. ${stats.maxLat.toFixed(4)},${stats.maxLng.toFixed(4)}]\n` +
      `  POIs=${demoPois.length}  gpx=${gpxPath}`,
  );

  await pool.end();
}

main().catch((err) => {
  console.error("Seed falló:", err);
  process.exit(1);
});
