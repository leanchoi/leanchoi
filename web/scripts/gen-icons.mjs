// Generates one SVG pin per POI type into web/public/icons/<type>.svg.
// Keep the color/glyph map in sync with src/poiTypes.ts.
// Run: node scripts/gen-icons.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const TYPES = {
  salida: { color: "#16a34a", glyph: "▶" },
  llegada: { color: "#dc2626", glyph: "⚑" },
  cultural: { color: "#7c3aed", glyph: "★" },
  naturaleza: { color: "#059669", glyph: "❦" },
  mirador: { color: "#0284c7", glyph: "◉" },
  pueblo: { color: "#b45309", glyph: "⌂" },
  cruce: { color: "#6b7280", glyph: "✚" },
  gastronomia: { color: "#ea580c", glyph: "☕" },
  alojamiento: { color: "#4f46e5", glyph: "▤" },
  agua: { color: "#0891b2", glyph: "≈" },
  precaucion: { color: "#eab308", glyph: "!" },
  interes: { color: "#2563eb", glyph: "i" },
};

const pin = (color, glyph) => `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="46" viewBox="0 0 34 46">
  <defs>
    <filter id="s" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="1" stdDeviation="1.2" flood-opacity="0.35"/>
    </filter>
  </defs>
  <path filter="url(#s)" fill="${color}" stroke="#ffffff" stroke-width="2"
    d="M17 1C9.3 1 3 7.3 3 15c0 9.9 12.1 27 13.1 28.3.5.6 1.3.6 1.8 0C18.9 42 31 24.9 31 15 31 7.3 24.7 1 17 1z"/>
  <circle cx="17" cy="15" r="8.5" fill="#ffffff"/>
  <text x="17" y="15" font-family="system-ui, sans-serif" font-size="11" font-weight="700"
    fill="${color}" text-anchor="middle" dominant-baseline="central">${glyph}</text>
</svg>`;

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");
mkdirSync(outDir, { recursive: true });

for (const [type, { color, glyph }] of Object.entries(TYPES)) {
  writeFileSync(join(outDir, `${type}.svg`), pin(color, glyph), "utf-8");
}
console.log(`Generados ${Object.keys(TYPES).length} íconos en ${outDir}`);
