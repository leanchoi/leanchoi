import { notFound } from "next/navigation";
import { resolveTenant } from "@/lib/tenants";
import { parseSiteConfig } from "@/lib/site-config";
import { publishedListings } from "@/server/queries";
import { BlockRenderer } from "@/components/site/blocks";
import { Track } from "@/components/track";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { domain: string } }) {
  const tenant = await resolveTenant(params.domain);
  if (!tenant) return {};
  return {
    title: `${tenant.name} — ${tenant.tagline ?? "Experiencias"}`,
    description: tenant.tagline,
  };
}

export default async function TenantHomePage({ params }: { params: { domain: string } }) {
  const tenant = await resolveTenant(params.domain);
  if (!tenant) notFound();

  const config = parseSiteConfig(tenant.siteConfig, tenant.name, tenant.tagline);
  const listings = await publishedListings({ tenantId: tenant.id });

  return (
    <>
      <Track type="PAGE_VIEW" channel="TENANT_SITE" tenantId={tenant.id} path="/" />
      <BlockRenderer
        blocks={config.blocks}
        listings={listings.map((l) => ({ ...l, tenant: null }))}
        basePath={`/sites/${params.domain}`}
      />
    </>
  );
}
