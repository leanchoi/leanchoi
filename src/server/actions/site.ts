"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/auth";
import { parseSiteConfig, siteConfigSchema, TEMPLATES, themeSchema, type SiteBlock } from "@/lib/site-config";

// Editor del sitio white-label: el dueño elige template, ajusta colores y
// arma su home con bloques predefinidos.

export async function applyTemplateAction(formData: FormData) {
  const session = await requireTenant();
  const templateId = String(formData.get("template")) as keyof typeof TEMPLATES;
  const template = TEMPLATES[templateId];
  if (!template) throw new Error("Template inválido");

  const tenant = await db.tenant.findUniqueOrThrow({ where: { id: session.tenantId } });
  const config = parseSiteConfig(tenant.siteConfig, tenant.name, tenant.tagline);
  config.template = templateId;
  config.theme = template.theme;
  await db.tenant.update({ where: { id: session.tenantId }, data: { siteConfig: config } });
  revalidatePath("/panel/sitio");
}

export async function saveThemeAction(formData: FormData) {
  const session = await requireTenant();
  const tenant = await db.tenant.findUniqueOrThrow({ where: { id: session.tenantId } });
  const config = parseSiteConfig(tenant.siteConfig, tenant.name, tenant.tagline);

  config.theme = themeSchema.parse({
    ...config.theme,
    bg: String(formData.get("bg") ?? config.theme.bg),
    ink: String(formData.get("ink") ?? config.theme.ink),
    primary: String(formData.get("primary") ?? config.theme.primary),
    accent: String(formData.get("accent") ?? config.theme.accent),
    card: String(formData.get("card") ?? config.theme.card),
    muted: String(formData.get("muted") ?? config.theme.muted),
    radius: String(formData.get("radius") ?? config.theme.radius),
    font: String(formData.get("font") ?? config.theme.font),
  });
  await db.tenant.update({ where: { id: session.tenantId }, data: { siteConfig: config } });
  revalidatePath("/panel/sitio");
}

// Guarda los bloques serializados por el editor (JSON en un hidden input).
export async function saveBlocksAction(formData: FormData) {
  const session = await requireTenant();
  const tenant = await db.tenant.findUniqueOrThrow({ where: { id: session.tenantId } });
  const config = parseSiteConfig(tenant.siteConfig, tenant.name, tenant.tagline);

  let blocks: unknown;
  try {
    blocks = JSON.parse(String(formData.get("blocks") ?? "[]"));
  } catch {
    throw new Error("Bloques inválidos");
  }
  const parsed = siteConfigSchema.shape.blocks.safeParse(blocks);
  if (!parsed.success) throw new Error("Bloques inválidos");
  config.blocks = parsed.data as SiteBlock[];

  await db.tenant.update({ where: { id: session.tenantId }, data: { siteConfig: config } });
  revalidatePath("/panel/sitio");
}

export async function saveContactAction(formData: FormData) {
  const session = await requireTenant();
  await db.tenant.update({
    where: { id: session.tenantId },
    data: {
      tagline: String(formData.get("tagline") ?? "").trim() || null,
      whatsapp: String(formData.get("whatsapp") ?? "").trim() || null,
      contactEmail: String(formData.get("contactEmail") ?? "").trim() || null,
    },
  });
  revalidatePath("/panel/sitio");
}
