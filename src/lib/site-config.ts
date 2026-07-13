import { z } from "zod";

// ── Configuracion del sitio white-label de cada tenant ───────────────────────
// Se guarda como JSON en Tenant.siteConfig. El dueño la edita desde su panel
// ("Mi sitio") con bloques predefinidos para que cada web se sienta propia.

export const themeSchema = z.object({
  bg: z.string().default("#FAF9F6"),
  ink: z.string().default("#191714"),
  primary: z.string().default("#8A4B2F"),
  accent: z.string().default("#3E5C76"),
  muted: z.string().default("#6E6759"),
  card: z.string().default("#FFFFFF"),
  radius: z.enum(["sharp", "soft", "round"]).default("soft"),
  font: z.enum(["moderna", "clasica", "fuerte"]).default("moderna"),
});

const heroBlock = z.object({
  type: z.literal("hero"),
  title: z.string(),
  subtitle: z.string().optional(),
  image: z.string().optional(),
  ctaLabel: z.string().default("Reservar"),
  layout: z.enum(["split", "full"]).default("split"),
});

const featuredBlock = z.object({
  type: z.literal("featured"),
  title: z.string().default("Experiencias"),
  intro: z.string().optional(),
  listingType: z.enum(["ACTIVITY", "PRODUCT", "ALL"]).default("ALL"),
});

const storyBlock = z.object({
  type: z.literal("story"),
  title: z.string(),
  body: z.string(),
  image: z.string().optional(),
  imageSide: z.enum(["left", "right"]).default("right"),
});

const galleryBlock = z.object({
  type: z.literal("gallery"),
  title: z.string().optional(),
  images: z.array(z.string()).default([]),
});

const testimonialsBlock = z.object({
  type: z.literal("testimonials"),
  items: z
    .array(z.object({ quote: z.string(), name: z.string(), origin: z.string().optional() }))
    .default([]),
});

const statsBlock = z.object({
  type: z.literal("stats"),
  items: z.array(z.object({ value: z.string(), label: z.string() })).default([]),
});

const faqBlock = z.object({
  type: z.literal("faq"),
  title: z.string().default("Preguntas frecuentes"),
  items: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
});

const ctaBlock = z.object({
  type: z.literal("cta"),
  title: z.string(),
  subtitle: z.string().optional(),
  buttonLabel: z.string().default("Reservar ahora"),
});

export const blockSchema = z.discriminatedUnion("type", [
  heroBlock,
  featuredBlock,
  storyBlock,
  galleryBlock,
  testimonialsBlock,
  statsBlock,
  faqBlock,
  ctaBlock,
]);

export const siteConfigSchema = z.object({
  template: z.enum(["campo", "litoral", "cumbre"]).default("campo"),
  theme: themeSchema.default({}),
  blocks: z.array(blockSchema).default([]),
});

export type SiteTheme = z.infer<typeof themeSchema>;
export type SiteBlock = z.infer<typeof blockSchema>;
export type SiteConfig = z.infer<typeof siteConfigSchema>;

// ── Templates predefinidos ────────────────────────────────────────────────────
// Cada template define una identidad visual distinta para que los sitios no se
// sientan homogeneos: paleta, tipografia y radio de esquinas propios.

export const TEMPLATES: Record<
  SiteConfig["template"],
  { name: string; description: string; theme: SiteTheme }
> = {
  campo: {
    name: "Campo",
    description: "Terracota y pizarra. Calido y de tierra: cabalgatas, estancias, gastronomia rural.",
    theme: {
      bg: "#F7F4EF",
      ink: "#241E19",
      primary: "#A14E2C",
      accent: "#44576D",
      muted: "#7A6F63",
      card: "#FFFFFF",
      radius: "soft",
      font: "clasica",
    },
  },
  litoral: {
    name: "Litoral",
    description: "Cobalto sobre crema. Fresco y nautico: kayak, pesca, delta, costa.",
    theme: {
      bg: "#FBFAF7",
      ink: "#13202E",
      primary: "#1D4ED8",
      accent: "#0E7490",
      muted: "#5B6B7A",
      card: "#FFFFFF",
      radius: "round",
      font: "moderna",
    },
  },
  cumbre: {
    name: "Cumbre",
    description: "Negro y tan. Contraste fuerte: montaña, trekking, aventura, vino de altura.",
    theme: {
      bg: "#141311",
      ink: "#F2EDE4",
      primary: "#D9A566",
      accent: "#8C9A84",
      muted: "#9C948A",
      card: "#1E1C19",
      radius: "sharp",
      font: "fuerte",
    },
  },
};

export function defaultSiteConfig(name: string, tagline?: string | null): SiteConfig {
  return siteConfigSchema.parse({
    template: "campo",
    theme: TEMPLATES.campo.theme,
    blocks: [
      { type: "hero", title: name, subtitle: tagline ?? "Experiencias que se recuerdan", ctaLabel: "Reservar" },
      { type: "featured", title: "Nuestras experiencias", listingType: "ALL" },
      {
        type: "story",
        title: "Quienes somos",
        body: "Contá acá la historia de tu emprendimiento: cómo empezó, qué lo hace distinto y por qué vale la pena vivirlo.",
        imageSide: "right",
      },
      { type: "cta", title: "¿Listo para la próxima salida?", buttonLabel: "Reservar ahora" },
    ],
  });
}

export function parseSiteConfig(raw: unknown, name: string, tagline?: string | null): SiteConfig {
  if (!raw) return defaultSiteConfig(name, tagline);
  const result = siteConfigSchema.safeParse(raw);
  return result.success ? result.data : defaultSiteConfig(name, tagline);
}

export function radiusToCss(radius: SiteTheme["radius"]): string {
  return radius === "sharp" ? "2px" : radius === "round" ? "22px" : "12px";
}
