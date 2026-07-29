import type { Config } from "tailwindcss";

// ── Tokens de Trochi ─────────────────────────────────────────────────────
//
// Espejo de las variables de app/globals.css. Antes convivían tres paletas
// (los tokens `trello.*`, las clases del módulo Arrayán, y hex sueltos
// repetidos a mano en el módulo de tableros); ahora hay un solo vocabulario
// y las dos mitades de la app se ven como un mismo producto.

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Geist", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        mono: ["Geist Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      colors: {
        // Superficies, de la más profunda a la más elevada
        surface: {
          void: "rgb(var(--s-void-c) / <alpha-value>)",
          base: "rgb(var(--s-base-c) / <alpha-value>)",
          sunken: "rgb(var(--s-sunken-c) / <alpha-value>)",
          raised: "rgb(var(--s-raised-c) / <alpha-value>)",
          raised2: "rgb(var(--s-raised-2-c) / <alpha-value>)",
          overlay: "rgb(var(--s-overlay-c) / <alpha-value>)",
          hover: "rgb(var(--s-hover-c) / <alpha-value>)",
        },
        line: {
          DEFAULT: "rgb(var(--line-c) / <alpha-value>)",
          soft: "rgb(var(--line-soft-c) / <alpha-value>)",
          strong: "rgb(var(--line-strong-c) / <alpha-value>)",
        },
        ink: {
          hi: "rgb(var(--t-hi-c) / <alpha-value>)",
          md: "rgb(var(--t-md-c) / <alpha-value>)",
          lo: "rgb(var(--t-lo-c) / <alpha-value>)",
        },
        // Acento de marca: teal glaciar
        brand: {
          DEFAULT: "rgb(var(--brand-c) / <alpha-value>)",
          hi: "rgb(var(--brand-hi-c) / <alpha-value>)",
          lo: "rgb(var(--brand-lo-c) / <alpha-value>)",
          ink: "rgb(var(--brand-ink-c) / <alpha-value>)",
        },
        // Estado semántico, deliberadamente separado del acento
        state: {
          ok: "rgb(var(--ok-c) / <alpha-value>)",
          warn: "rgb(var(--warn-c) / <alpha-value>)",
          crit: "rgb(var(--crit-c) / <alpha-value>)",
          info: "rgb(var(--info-c) / <alpha-value>)",
        },
      },
      borderRadius: {
        chip: "var(--radius-chip)",
        control: "var(--radius-control)",
        panel: "var(--radius-panel)",
        surface: "var(--radius-surface)",
      },
      boxShadow: {
        // La elevación incluye un realce interior de 1px arriba: ese detalle
        // es lo que hace que una superficie parezca material y no un div.
        "lift-1": "var(--lift-1)",
        "lift-2": "var(--lift-2)",
        "lift-3": "var(--lift-3)",
        glow: "0 0 24px -6px rgb(46 197 172 / 0.45)",
      },
      fontSize: {
        micro: ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.005em" }],
        meta: ["0.75rem", { lineHeight: "1.1rem" }],
      },
      transitionTimingFunction: {
        out: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};
export default config;
