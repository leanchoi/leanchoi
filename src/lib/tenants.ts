import "server-only";
import { cache } from "react";
import { db } from "./db";

// Resuelve un sitio white-label a partir del identificador que deja el
// middleware en la URL. Acepta, en orden:
//  1. dominio propio exacto (pepitocabalgatas.com)
//  2. subdominio de la plataforma (pepito.miplataforma.com → "pepito")
//  3. slug directo (para previews internas: /sites/pepito)
export const resolveTenant = cache(async (domainOrSlug: string) => {
  const decoded = decodeURIComponent(domainOrSlug).toLowerCase();
  const platformDomain = (process.env.PLATFORM_DOMAIN ?? "localhost:3000").split(":")[0];
  const host = decoded.split(":")[0];

  let slugCandidate = decoded;
  if (host.endsWith(`.${platformDomain}`)) {
    slugCandidate = host.slice(0, -(platformDomain.length + 1));
  } else if (host.endsWith(".localhost")) {
    slugCandidate = host.slice(0, -".localhost".length);
  }

  const tenant = await db.tenant.findFirst({
    where: {
      status: "ACTIVE",
      OR: [{ customDomain: host }, { slug: slugCandidate }],
    },
  });
  return tenant;
});

export function tenantSiteUrl(tenant: { slug: string; customDomain: string | null }): string {
  if (tenant.customDomain) return `https://${tenant.customDomain}`;
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  // en dev no hay subdominios: usamos la ruta de preview interna
  return `${base}/sites/${tenant.slug}`;
}
