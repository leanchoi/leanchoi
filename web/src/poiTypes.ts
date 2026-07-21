import type { PoiType } from "./api.js";

export interface PoiTypeMeta {
  label: string;
  color: string;
  /** Single emoji/glyph drawn inside the pin. */
  glyph: string;
}

/**
 * Canonical metadata for the 12 POI types. This is the single source of truth
 * for both the runtime marker rendering and the generated SVG pins
 * (see scripts/gen-icons.mjs → public/icons/<type>.svg).
 */
export const POI_TYPES: Record<PoiType, PoiTypeMeta> = {
  salida: { label: "Salida", color: "#16a34a", glyph: "▶" },
  llegada: { label: "Llegada", color: "#dc2626", glyph: "⚑" },
  cultural: { label: "Cultural", color: "#7c3aed", glyph: "★" },
  naturaleza: { label: "Naturaleza", color: "#059669", glyph: "❦" },
  mirador: { label: "Mirador", color: "#0284c7", glyph: "◉" },
  pueblo: { label: "Pueblo", color: "#b45309", glyph: "⌂" },
  cruce: { label: "Cruce", color: "#6b7280", glyph: "✚" },
  gastronomia: { label: "Gastronomía", color: "#ea580c", glyph: "☕" },
  alojamiento: { label: "Alojamiento", color: "#4f46e5", glyph: "▤" },
  agua: { label: "Agua", color: "#0891b2", glyph: "≈" },
  precaucion: { label: "Precaución", color: "#eab308", glyph: "!" },
  interes: { label: "Interés", color: "#2563eb", glyph: "i" },
};

export const POI_TYPE_LIST = Object.keys(POI_TYPES) as PoiType[];
