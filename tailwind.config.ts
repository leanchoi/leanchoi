import type { Config } from "tailwindcss";

// ── Tokens de Trochi ─────────────────────────────────────────────────────
//
// Antes convivían tres paletas: los tokens `trello.*` (que ya casi no se
// usaban), las clases .btn/.card/.input del módulo Arrayán, y hex sueltos
// repetidos a mano en el módulo de tableros (#0f172a, #1e293b, #243447,
// #3b5068, #0b1220, #2e415c…). Acá quedan nombrados una sola vez para que
// las dos mitades de la app se vean como una sola.

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Superficies, de la más profunda a la más elevada
        surface: {
          base: "#0f172a",   // fondo de la app
          sunken: "#0b1220",  // listas, contenedores de tabla
          raised: "#1e293b",  // tarjetas, filas
          overlay: "#243447", // popovers y menús
          hover: "#2e415c",   // estado hover de una superficie elevada
        },
        edge: {
          DEFAULT: "#3b5068", // borde estándar
          subtle: "#243447",  // separador tenue
        },
        // Acento de marca (el teal que ya usaba Arrayán)
        brand: {
          50: "#f0fdfa",
          200: "#99f6e4",
          300: "#5eead4",
          400: "#2dd4bf",
          500: "#14b8a6",
          600: "#0d9488",
          700: "#0f766e",
          900: "#134e4a",
        },
        // Azul del logo
        ink: {
          light: "#b9c8ea",
          DEFAULT: "#1d3461",
          deep: "#101f3c",
        },
      },
      borderRadius: {
        // Escala reducida: control / contenedor / superficie
        control: "0.625rem", // 10px  — botones, inputs, chips
        panel: "0.875rem",   // 14px  — tarjetas, columnas
        surface: "1rem",     // 16px  — modales, popovers, tiles
      },
      boxShadow: {
        raised: "0 1px 0 rgb(255 255 255 / 0.04) inset, 0 10px 30px -12px rgb(0 0 0 / 0.45)",
        overlay: "0 1px 0 rgb(255 255 255 / 0.05) inset, 0 18px 50px -12px rgb(0 0 0 / 0.6)",
      },
      fontSize: {
        // Escala tipográfica explícita, para dejar de usar text-[8.5px] & co.
        micro: ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.02em" }], // 11px
        meta: ["0.75rem", { lineHeight: "1.1rem" }],                            // 12px
      },
    },
  },
  plugins: [],
};
export default config;
