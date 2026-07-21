import { DOMParser } from "@xmldom/xmldom";
import { gpx as gpxToGeoJson } from "@tmcw/togeojson";
import length from "@turf/length";
import bbox from "@turf/bbox";
import center from "@turf/center";
import type { Feature, FeatureCollection, LineString, MultiLineString } from "geojson";

export interface GpxStats {
  distanceM: number;
  ascentM: number;
  descentM: number;
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
  centerLat: number;
  centerLng: number;
}

/** Elevation noise filter (metres): deltas below this are ignored. */
const ELEVATION_THRESHOLD_M = 3;

/**
 * Parse a GPX document (XML string) and compute route statistics:
 * distance, cumulative +/- elevation, bounding box and centroid.
 */
export function parseGpxStats(xml: string): GpxStats {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  // @xmldom Document is structurally compatible with what togeojson needs.
  const geo = gpxToGeoJson(
    doc as unknown as Parameters<typeof gpxToGeoJson>[0],
  ) as FeatureCollection;

  if (!geo.features.length) {
    throw new Error("GPX sin geometría reconocible (no hay <trk> ni <rte>)");
  }

  // Distance in km -> metres.
  const distanceKm = length(geo, { units: "kilometers" });
  const distanceM = Math.round(distanceKm * 1000);

  // BBox: [minLng, minLat, maxLng, maxLat].
  const [minLng, minLat, maxLng, maxLat] = bbox(geo);

  const c = center(geo);
  const [centerLng, centerLat] = c.geometry.coordinates;

  const { ascentM, descentM } = computeElevation(geo);

  return {
    distanceM,
    ascentM,
    descentM,
    minLat,
    minLng,
    maxLat,
    maxLng,
    centerLat,
    centerLng,
  };
}

/**
 * Sum positive/negative elevation deltas across every line feature, applying a
 * small threshold to filter GPS jitter. Points without a 3rd (elevation)
 * coordinate contribute nothing.
 */
function computeElevation(geo: FeatureCollection): {
  ascentM: number;
  descentM: number;
} {
  let ascent = 0;
  let descent = 0;

  for (const feature of geo.features) {
    for (const line of extractLines(feature)) {
      let prevEle: number | null = null;
      for (const coord of line) {
        const ele = coord.length >= 3 ? coord[2] : null;
        if (ele == null || Number.isNaN(ele)) {
          prevEle = null;
          continue;
        }
        if (prevEle != null) {
          const delta = ele - prevEle;
          if (Math.abs(delta) >= ELEVATION_THRESHOLD_M) {
            if (delta > 0) ascent += delta;
            else descent += -delta;
            prevEle = ele;
          }
          // else: keep prevEle as anchor so small drifts don't accumulate.
        } else {
          prevEle = ele;
        }
      }
    }
  }

  return { ascentM: Math.round(ascent), descentM: Math.round(descent) };
}

function extractLines(feature: Feature): number[][][] {
  const g = feature.geometry;
  if (!g) return [];
  if (g.type === "LineString") {
    return [(g as LineString).coordinates];
  }
  if (g.type === "MultiLineString") {
    return (g as MultiLineString).coordinates;
  }
  return [];
}
