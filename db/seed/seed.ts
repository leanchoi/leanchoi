/**
 * Carga los circuitos de ejemplo del Sistema de Montaña de Esquel en YATEN.
 *
 * Para cada circuito: genera una traza GPX sintética a partir de puntos de
 * anclaje, la parsea con el mismo parser de la API (§4.1) para poblar
 * distancia / desnivel / bbox / centro, genera una portada a partir del perfil
 * de altimetría real, y siembra los POIs ubicados sobre la traza.
 *
 * Ejecutar:  docker compose exec api npm run seed
 * Es idempotente: vuelve a crear los circuitos de ejemplo desde cero.
 */
import { eq } from "../../api/src/db/orm.js";
import { db, pool } from "../../api/src/db/client.js";
import { pois, routes } from "../../api/src/db/schema.js";
import { runMigrations } from "../../api/src/db/migrate.js";
import { getStorage } from "../../api/src/lib/storage.js";
import { parseGpxStats } from "../../api/src/lib/gpx.js";
import {
  CIRCUITOS,
  NOTA_INTERNA_SEED,
  type Anchor,
  type SeedCircuit,
} from "./circuitos.js";

interface Pt {
  lat: number;
  lng: number;
  ele: number;
}

/** Puntos interpolados entre cada par de anclas, para una traza fluida. */
const STEPS_PER_LEG = 26;

/**
 * Interpola la traza entre anclas. Agrega una ondulación determinista al
 * trazado y a la elevación para que el recorrido y el perfil no sean rectas
 * perfectas (una traza real nunca lo es).
 */
function buildTrack(anchors: Anchor[]): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    const isLast = i === anchors.length - 2;
    const steps = isLast ? STEPS_PER_LEG : STEPS_PER_LEG - 1;
    for (let s = 0; s <= steps; s++) {
      const t = s / STEPS_PER_LEG;
      const phase = (i + t) * Math.PI;
      // Serpenteo lateral perpendicular al tramo.
      const dLat = b.lat - a.lat;
      const dLng = b.lng - a.lng;
      const len = Math.hypot(dLat, dLng) || 1;
      const wig = Math.sin(phase * 3.1) * 0.0011;
      out.push({
        lat: a.lat + dLat * t + (-dLng / len) * wig,
        lng: a.lng + dLng * t + (dLat / len) * wig,
        ele: Math.round(
          a.ele + (b.ele - a.ele) * t + Math.sin(phase * 2.3) * 11,
        ),
      });
    }
  }
  return out;
}

function buildGpx(name: string, points: Pt[]): string {
  const trkpts = points
    .map(
      (p) =>
        `      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lng.toFixed(
          6,
        )}"><ele>${p.ele}</ele></trkpt>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="YATEN — Sistema de Montaña de Esquel" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${escapeXml(name)}</name></metadata>
  <trk>
    <name>${escapeXml(name)}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Portada generada a partir del perfil de altimetría real del circuito.
 * No es una fotografía: es una pieza gráfica derivada de la traza, pensada
 * para que la ficha se vea completa hasta que se cargue la foto definitiva.
 */
function buildCoverSvg(circuit: SeedCircuit, points: Pt[]): string {
  const W = 800;
  const H = 500;
  const eles = points.map((p) => p.ele);
  const min = Math.min(...eles);
  const max = Math.max(...eles);
  const span = max - min || 1;

  const ridge = (
    scale: number,
    baseY: number,
    amp: number,
    fill: string,
    opacity: number,
  ): string => {
    const pts = points
      .map((p, i) => {
        const x = (i / (points.length - 1)) * W;
        const y = baseY - ((p.ele - min) / span) * amp * scale;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    return `<polygon points="0,${H} ${pts} ${W},${H}" fill="${fill}" opacity="${opacity}"/>`;
  };

  const title = escapeXml(circuit.name).toUpperCase();
  const sub = escapeXml(circuit.region);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0b3b39"/>
      <stop offset="55%" stop-color="#14807a"/>
      <stop offset="100%" stop-color="#5eead4"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <circle cx="640" cy="105" r="42" fill="#fde68a" opacity="0.85"/>
  ${ridge(1.0, H - 40, 250, "#0f766e", 0.55)}
  ${ridge(1.25, H + 10, 300, "#0b4f4a", 0.85)}
  ${ridge(1.5, H + 70, 340, "#062f2c", 1)}
  <text x="44" y="${H - 92}" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
        font-size="40" font-weight="800" fill="#ffffff" letter-spacing="0.5">${title}</text>
  <text x="46" y="${H - 62}" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
        font-size="16" font-weight="600" fill="#99f6e4" letter-spacing="1.5">${sub.toUpperCase()}</text>
  <text x="46" y="34" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
        font-size="13" font-weight="700" fill="#ffffff" opacity="0.75" letter-spacing="2.5">YATEN</text>
</svg>`;
}

/** Punto de la traza en la fracción `t` del recorrido (0 = salida, 1 = llegada). */
function pointAt(points: Pt[], t: number): Pt {
  const idx = Math.min(
    points.length - 1,
    Math.max(0, Math.round(t * (points.length - 1))),
  );
  return points[idx];
}

function haversine(a: Pt, b: Pt): number {
  const R = 6371000;
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Distancia acumulada hasta la fracción `t`, en metros. */
function distanceAt(points: Pt[], t: number): number {
  const target = Math.round(t * (points.length - 1));
  let cum = 0;
  for (let i = 1; i <= target; i++) cum += haversine(points[i - 1], points[i]);
  return Math.round(cum);
}

async function seedCircuit(circuit: SeedCircuit): Promise<void> {
  const storage = getStorage();
  const track = buildTrack(circuit.anchors);
  const gpxXml = buildGpx(circuit.name, track);
  const stats = parseGpxStats(gpxXml);

  // Reemplaza el circuito si ya existía (cascade borra sus POIs).
  await db.delete(routes).where(eq(routes.slug, circuit.slug));

  const [route] = await db
    .insert(routes)
    .values({
      slug: circuit.slug,
      name: circuit.name,
      summary: circuit.summary,
      description: circuit.description,
      difficulty: circuit.difficulty,
      activity: circuit.activity,
      region: circuit.region,
      province: circuit.province,
      country: "AR",
      durationMin: circuit.durationMin,
      defaultLocale: "es",
      status: circuit.status,
      distanceM: stats.distanceM,
      ascentM: stats.ascentM,
      descentM: stats.descentM,
      minLat: stats.minLat,
      minLng: stats.minLng,
      maxLat: stats.maxLat,
      maxLng: stats.maxLng,
      centerLat: stats.centerLat,
      centerLng: stats.centerLng,
      // Ficha del Sistema
      systemState: circuit.systemState,
      soilSituation: circuit.soilSituation,
      altNames: circuit.altNames,
      accessDescription: circuit.accessDescription,
      compatibleUses: circuit.compatibleUses,
      incompatibleUses: circuit.incompatibleUses,
      seasonality: circuit.seasonality,
      risks: circuit.risks,
      conservationState: circuit.conservationState,
      maintainedBy: circuit.maintainedBy,
      background: circuit.background,
      contributedBy: circuit.contributedBy,
      reviewedBy: circuit.reviewedBy,
      managementNotes: NOTA_INTERNA_SEED,
    })
    .returning();

  const gpxPath = await storage.saveBuffer("gpx", `${route.id}.gpx`, gpxXml);
  const coverPath = await storage.saveBuffer(
    "covers",
    `${route.id}_cover.svg`,
    buildCoverSvg(circuit, track),
  );
  await db
    .update(routes)
    .set({ gpxPath, coverPath })
    .where(eq(routes.id, route.id));

  await db.insert(pois).values(
    circuit.pois.map((p, i) => {
      const base = pointAt(track, p.at);
      return {
        routeId: route.id,
        orderIndex: i,
        distanceM: distanceAt(track, p.at),
        type: p.type,
        name: p.name,
        description: p.description,
        lat: base.lat + (p.offsetLat ?? 0),
        lng: base.lng + (p.offsetLng ?? 0),
      };
    }),
  );

  const pub = circuit.status === "published" ? "publicado" : "no publicado";
  console.log(
    `  ✓ ${circuit.name.padEnd(22)} ${String(
      (stats.distanceM / 1000).toFixed(1),
    ).padStart(5)} km  ⬆${String(stats.ascentM).padStart(4)} m  ` +
      `${circuit.pois.length} POIs  [${circuit.systemState}, ${pub}]`,
  );
}

async function main(): Promise<void> {
  await runMigrations();

  console.log("Sembrando circuitos del Sistema de Montaña de Esquel…\n");
  for (const circuit of CIRCUITOS) {
    await seedCircuit(circuit);
  }

  const publicados = CIRCUITOS.filter((c) => c.status === "published").length;
  const totalPois = CIRCUITOS.reduce((n, c) => n + c.pois.length, 0);
  console.log(
    `\nListo: ${CIRCUITOS.length} circuitos (${publicados} publicados, ` +
      `${CIRCUITOS.length - publicados} en el inventario sin difundir), ` +
      `${totalPois} puntos de interés.`,
  );
  console.log(
    "\nNota: trazas sintéticas y contenido de ejemplo. Reemplazar por el\n" +
      "relevamiento real antes de dar las fichas por cerradas.",
  );

  await pool.end();
}

main().catch((err) => {
  console.error("Seed falló:", err);
  process.exit(1);
});
