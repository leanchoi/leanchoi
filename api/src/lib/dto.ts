import type { Poi, PoiTranslation, Route } from "../db/schema.js";

function baseUrl(): string {
  return (process.env.PUBLIC_BASE_URL ?? "").replace(/\/+$/, "");
}

/** Build an absolute URL for a stored file (served under /files/*). */
export function fileUrl(relPath: string | null | undefined): string | null {
  if (!relPath) return null;
  const clean = relPath.replace(/^\/+/, "");
  return `${baseUrl()}/files/${clean}`;
}

/** Icon URL for a POI type — static SVG served by the web container. */
export function iconUrl(type: string): string {
  return `${baseUrl()}/icons/${type}.svg`;
}

export interface RouteCard {
  slug: string;
  name: string;
  summary: string | null;
  difficulty: string;
  activity: string;
  region: string | null;
  distanceM: number;
  ascentM: number;
  coverUrl: string | null;
  centerLat: number | null;
  centerLng: number | null;
}

export function toRouteCard(r: Route): RouteCard {
  return {
    slug: r.slug,
    name: r.name,
    summary: r.summary,
    difficulty: r.difficulty,
    activity: r.activity,
    region: r.region,
    distanceM: r.distanceM ?? 0,
    ascentM: r.ascentM ?? 0,
    coverUrl: fileUrl(r.coverPath),
    centerLat: r.centerLat,
    centerLng: r.centerLng,
  };
}

export interface PoiDTO {
  id: string;
  orderIndex: number;
  distanceM: number | null;
  type: string;
  name: string;
  description: string | null;
  lat: number;
  lng: number;
  iconUrl: string;
  audioUrl: string | null;
  audioTranscript: string | null;
  videoUrl: string | null;
  photoUrl: string | null;
}

/**
 * Localize a POI: overlay a translation for `locale` (if present) on top of the
 * base row, falling back to the base fields. `hidden` POIs must be filtered out
 * before calling this.
 */
export function toPoiDTO(
  poi: Poi,
  translation: PoiTranslation | undefined,
): PoiDTO {
  const name = translation?.name || poi.name;
  const description =
    translation?.description ?? poi.description ?? null;
  const audioPath = translation?.audioPath ?? poi.audioPath;
  const audioTranscript =
    translation?.audioTranscript ?? poi.audioTranscript ?? null;

  return {
    id: poi.id,
    orderIndex: poi.orderIndex,
    distanceM: poi.distanceM,
    type: poi.type,
    name,
    description,
    lat: poi.lat,
    lng: poi.lng,
    iconUrl: iconUrl(poi.type),
    audioUrl: fileUrl(audioPath),
    audioTranscript,
    videoUrl: poi.videoUrl ?? null,
    photoUrl: fileUrl(poi.photoPath),
  };
}

export interface RouteDetailDTO extends RouteCard {
  description: string | null;
  province: string | null;
  country: string | null;
  descentM: number;
  durationMin: number | null;
  defaultLocale: string;
  gpxUrl: string | null;
  minLat: number | null;
  minLng: number | null;
  maxLat: number | null;
  maxLng: number | null;
  pois: PoiDTO[];
}

export function toRouteDetail(route: Route, pois: PoiDTO[]): RouteDetailDTO {
  return {
    ...toRouteCard(route),
    description: route.description,
    province: route.province,
    country: route.country,
    descentM: route.descentM ?? 0,
    durationMin: route.durationMin,
    defaultLocale: route.defaultLocale,
    gpxUrl: fileUrl(route.gpxPath),
    minLat: route.minLat,
    minLng: route.minLng,
    maxLat: route.maxLat,
    maxLng: route.maxLng,
    pois,
  };
}
