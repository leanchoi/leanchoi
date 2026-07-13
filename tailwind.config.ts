import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bone: "#FAF9F6",
        ink: "#101613",
        pine: {
          DEFAULT: "#1E4D3B",
          deep: "#143226",
          soft: "#2A6B52",
          mist: "#E8EFEA",
        },
        amber: {
          burnt: "#C96F1E",
          soft: "#F5E9DC",
        },
        // Tokens tematizables por sitio white-label (CSS vars)
        site: {
          bg: "var(--site-bg)",
          ink: "var(--site-ink)",
          primary: "var(--site-primary)",
          accent: "var(--site-accent)",
          muted: "var(--site-muted)",
          card: "var(--site-card)",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "1rem",
      },
      maxWidth: {
        shell: "1280px",
      },
      keyframes: {
        rise: {
          from: { opacity: "0", transform: "translateY(18px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        rise: "rise 0.7s cubic-bezier(0.16, 1, 0.3, 1) both",
      },
    },
  },
  plugins: [],
};
export default config;
