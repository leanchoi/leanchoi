// Typed fetch wrapper. Same-origin in production (nginx proxies /api + /files),
// and Vite proxies both in dev — so relative URLs work everywhere.

export type Difficulty = "facil" | "moderada" | "dificil";
export type Activity =
  | "senderismo"
  | "bici"
  | "auto"
  | "cabalgata"
  | "mixto";
export type PoiType =
  | "salida"
  | "llegada"
  | "cultural"
  | "naturaleza"
  | "mirador"
  | "pueblo"
  | "cruce"
  | "gastronomia"
  | "alojamiento"
  | "agua"
  | "precaucion"
  | "interes";
export type Locale = "es" | "en" | "cy";

/** Estado del circuito dentro del Sistema de Montaña. */
export type SystemState =
  | "relevado"
  | "en_gestion_de_acuerdo"
  | "publicable"
  | "uso_local_no_difundible"
  | "suspendido";

/** Situación del suelo que atraviesa el circuito. */
export type SoilSituation =
  | "publico"
  | "privado_con_acuerdo"
  | "privado_sin_acuerdo"
  | "titularidad_en_definicion"
  | "provincial_o_nacional";

/** Ficha mínima del Sistema (campos públicos). */
export interface Ficha {
  systemState: SystemState;
  soilSituation: SoilSituation | null;
  altNames: string | null;
  accessDescription: string | null;
  compatibleUses: string | null;
  incompatibleUses: string | null;
  seasonality: string | null;
  risks: string | null;
  conservationState: string | null;
  maintainedBy: string | null;
  background: string | null;
  contributedBy: string | null;
  reviewedBy: string | null;
}

export interface RouteCard {
  slug: string;
  name: string;
  summary: string | null;
  difficulty: Difficulty;
  activity: Activity;
  region: string | null;
  distanceM: number;
  ascentM: number;
  coverUrl: string | null;
  centerLat: number | null;
  centerLng: number | null;
}

export interface PoiDTO {
  id: string;
  orderIndex: number;
  distanceM: number | null;
  type: PoiType;
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

export interface RouteDetail extends RouteCard {
  description: string | null;
  province: string | null;
  country: string | null;
  descentM: number;
  durationMin: number | null;
  defaultLocale: Locale;
  gpxUrl: string | null;
  minLat: number | null;
  minLng: number | null;
  maxLat: number | null;
  maxLng: number | null;
  pois: PoiDTO[];
  ficha: Ficha;
}

export interface ListResponse {
  items: RouteCard[];
  total: number;
  page: number;
  limit: number;
}

export interface ListParams {
  q?: string;
  difficulty?: Difficulty;
  activity?: Activity;
  region?: string;
  page?: number;
  limit?: number;
}

// ─── Admin DTOs (raw DB rows) ────────────────────────────────
export interface AdminRoute {
  id: string;
  slug: string;
  name: string;
  summary: string | null;
  description: string | null;
  difficulty: Difficulty;
  activity: Activity;
  region: string | null;
  province: string | null;
  country: string | null;
  distanceM: number | null;
  ascentM: number | null;
  descentM: number | null;
  durationMin: number | null;
  coverPath: string | null;
  gpxPath: string | null;
  minLat: number | null;
  minLng: number | null;
  maxLat: number | null;
  maxLng: number | null;
  centerLat: number | null;
  centerLng: number | null;
  defaultLocale: Locale;
  status: "draft" | "published";
  // Ficha mínima del Sistema de Montaña.
  systemState: SystemState;
  soilSituation: SoilSituation | null;
  altNames: string | null;
  accessDescription: string | null;
  compatibleUses: string | null;
  incompatibleUses: string | null;
  seasonality: string | null;
  risks: string | null;
  conservationState: string | null;
  maintainedBy: string | null;
  background: string | null;
  contributedBy: string | null;
  reviewedBy: string | null;
  managementNotes: string | null;
}

export interface AdminPoi {
  id: string;
  routeId: string;
  orderIndex: number;
  distanceM: number | null;
  type: PoiType;
  name: string;
  description: string | null;
  lat: number;
  lng: number;
  audioPath: string | null;
  audioTranscript: string | null;
  videoUrl: string | null;
  photoPath: string | null;
  hidden: boolean;
}

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  opts: RequestInit = {},
  token?: string,
): Promise<T> {
  const headers = new Headers(opts.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (
    opts.body &&
    !(opts.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(path, { ...opts, headers });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.json();
      msg = body.message ?? msg;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, msg);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function qs(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

// ─── Public API ──────────────────────────────────────────────
export const api = {
  listRoutes(params: ListParams = {}): Promise<ListResponse> {
    return request<ListResponse>(`/api/routes${qs({ ...params })}`);
  },
  getRoute(slug: string, locale?: Locale): Promise<RouteDetail> {
    return request<RouteDetail>(`/api/routes/${slug}${qs({ locale })}`);
  },
};

// ─── Admin API (token-scoped) ────────────────────────────────
export function adminApi(token: string) {
  const t = token;
  return {
    listRoutes: () =>
      request<{ items: AdminRoute[] }>(`/api/admin/routes`, {}, t),
    getRoute: (id: string) =>
      request<{ route: AdminRoute; pois: AdminPoi[] }>(
        `/api/admin/routes/${id}`,
        {},
        t,
      ),
    createRoute: (body: unknown) =>
      request<AdminRoute>(
        `/api/admin/routes`,
        { method: "POST", body: JSON.stringify(body) },
        t,
      ),
    updateRoute: (id: string, body: unknown) =>
      request<AdminRoute>(
        `/api/admin/routes/${id}`,
        { method: "PATCH", body: JSON.stringify(body) },
        t,
      ),
    deleteRoute: (id: string) =>
      request<{ ok: boolean }>(
        `/api/admin/routes/${id}`,
        { method: "DELETE" },
        t,
      ),
    uploadGpx: (id: string, file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return request<{ route: AdminRoute; stats: unknown }>(
        `/api/admin/routes/${id}/gpx`,
        { method: "POST", body: fd },
        t,
      );
    },
    publish: (id: string) =>
      request<AdminRoute>(
        `/api/admin/routes/${id}/publish`,
        { method: "POST" },
        t,
      ),
    unpublish: (id: string) =>
      request<AdminRoute>(
        `/api/admin/routes/${id}/unpublish`,
        { method: "POST" },
        t,
      ),
    createPoi: (body: unknown) =>
      request<AdminPoi>(
        `/api/admin/pois`,
        { method: "POST", body: JSON.stringify(body) },
        t,
      ),
    updatePoi: (id: string, body: unknown) =>
      request<AdminPoi>(
        `/api/admin/pois/${id}`,
        { method: "PATCH", body: JSON.stringify(body) },
        t,
      ),
    deletePoi: (id: string) =>
      request<{ ok: boolean }>(
        `/api/admin/pois/${id}`,
        { method: "DELETE" },
        t,
      ),
    reorderPois: (items: { id: string; orderIndex: number }[]) =>
      request<{ ok: boolean }>(
        `/api/admin/pois/reorder`,
        { method: "POST", body: JSON.stringify(items) },
        t,
      ),
    upload: (kind: "audio" | "photo" | "cover", file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return request<{ path: string }>(
        `/api/admin/uploads/${kind}`,
        { method: "POST", body: fd },
        t,
      );
    },
  };
}

export type AdminApi = ReturnType<typeof adminApi>;
export { ApiError };
