import "server-only";
import { db } from "@/lib/db";

// Queries compartidas del storefront (master y sitios white-label).

export function publishedListings(opts: {
  type?: "ACTIVITY" | "PRODUCT";
  tenantId?: string | null;
  onlyMasterVisible?: boolean;
  featured?: boolean;
  take?: number;
}) {
  return db.listing.findMany({
    where: {
      status: "PUBLISHED",
      ...(opts.type ? { type: opts.type } : {}),
      ...(opts.tenantId !== undefined ? { tenantId: opts.tenantId } : {}),
      ...(opts.onlyMasterVisible ? { visibleOnMaster: true, OR: [{ tenantId: null }, { tenant: { status: "ACTIVE" } }] } : {}),
      ...(opts.featured ? { featured: true } : {}),
    },
    include: { tenant: { select: { name: true, slug: true, customDomain: true } } },
    orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
    take: opts.take,
  });
}

export function listingBySlug(slug: string) {
  return db.listing.findUnique({
    where: { slug },
    include: {
      tenant: { select: { id: true, name: true, slug: true, tagline: true, customDomain: true, whatsapp: true } },
      slots: {
        where: { startsAt: { gte: new Date() } },
        orderBy: { startsAt: "asc" },
        take: 60,
      },
    },
  });
}

export function activeTenants() {
  return db.tenant.findMany({
    where: { status: "ACTIVE" },
    include: { _count: { select: { listings: { where: { status: "PUBLISHED" } } } } },
    orderBy: { createdAt: "asc" },
  });
}

export function orderByCode(code: string) {
  return db.order.findUnique({
    where: { code },
    include: { items: { include: { slot: true, listing: { select: { slug: true, title: true } } } }, tenant: true },
  });
}
