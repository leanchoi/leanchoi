import { gpx as gpxToGeoJson } from "@tmcw/togeojson";
import type { TrackPoint } from "./components/elevationChart.js";

function haversine(
  a: [number, number],
  b: [number, number],
): number {
  const R = 6371000;
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Fetch and parse a GPX file into an ordered list of track points with
 * cumulative distance and elevation. Fully client-side (native DOMParser +
 * bundled togeojson) — no CDN, works over plain HTTP.
 */
export async function loadTrack(gpxUrl: string): Promise<TrackPoint[]> {
  const res = await fetch(gpxUrl);
  if (!res.ok) throw new Error(`No se pudo cargar el GPX (${res.status})`);
  const xml = await res.text();
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const geo = gpxToGeoJson(doc);

  // Collect all line coordinates (handles LineString + MultiLineString).
  const coords: number[][] = [];
  for (const f of geo.features) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === "LineString") {
      coords.push(...(g.coordinates as number[][]));
    } else if (g.type === "MultiLineString") {
      for (const line of g.coordinates as number[][][]) coords.push(...line);
    }
  }

  const points: TrackPoint[] = [];
  let cum = 0;
  let prev: [number, number] | null = null;
  for (const c of coords) {
    const lng = c[0];
    const lat = c[1];
    const ele = c.length >= 3 && !Number.isNaN(c[2]) ? c[2] : 0;
    if (prev) cum += haversine(prev, [lat, lng]);
    points.push({ lat, lng, ele, dist: cum });
    prev = [lat, lng];
  }
  return points;
}
