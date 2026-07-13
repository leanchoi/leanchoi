"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { slugify } from "@/lib/utils";

// CRUD de listados. Un tenant solo toca su inventario; el master puede tocar
// todo (incluido el inventario propio, tenantId null).

async function assertCanEdit(listingTenantId: string | null) {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHORIZED");
  if (session.role === "MASTER") return session;
  if (session.tenantId && session.tenantId === listingTenantId) return session;
  throw new Error("FORBIDDEN");
}

export async function upsertListingAction(formData: FormData) {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHORIZED");

  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (title.length < 3) throw new Error("Título muy corto");

  // el master puede crear inventario propio; el tenant siempre crea en su cuenta
  const ownTenantId =
    session.role === "MASTER" ? (String(formData.get("tenantId") ?? "") || null) : session.tenantId;

  const type: "ACTIVITY" | "PRODUCT" = formData.get("type") === "PRODUCT" ? "PRODUCT" : "ACTIVITY";
  const priceRaw = Number(formData.get("price") ?? 0);
  const images = String(formData.get("images") ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const includes = String(formData.get("includes") ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const data = {
    title,
    type,
    category: String(formData.get("category") ?? "General").trim() || "General",
    location: String(formData.get("location") ?? "").trim() || null,
    shortDescription: String(formData.get("shortDescription") ?? "").trim() || null,
    description: String(formData.get("description") ?? "").trim(),
    priceCents: Math.round(priceRaw * 100),
    durationMinutes: Number(formData.get("durationMinutes")) || null,
    capacityPerSlot: type === "ACTIVITY" ? Number(formData.get("capacityPerSlot")) || 10 : null,
    stock: type === "PRODUCT" ? Number(formData.get("stock")) || 0 : null,
    images,
    includes,
    status: (formData.get("status") === "PUBLISHED" ? "PUBLISHED" : "DRAFT") as "PUBLISHED" | "DRAFT",
  };

  if (id) {
    const existing = await db.listing.findUnique({ where: { id } });
    if (!existing) throw new Error("No existe el listado");
    await assertCanEdit(existing.tenantId);
    await db.listing.update({ where: { id }, data });
  } else {
    const base = slugify(title);
    let slug = base;
    for (let i = 2; await db.listing.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;
    await db.listing.create({ data: { ...data, slug, tenantId: ownTenantId } });
  }

  revalidatePath("/panel/listados");
  revalidatePath("/master/inventario");
  redirect(session.role === "MASTER" ? "/master/inventario" : "/panel/listados");
}

export async function deleteListingAction(formData: FormData) {
  const id = String(formData.get("id"));
  const listing = await db.listing.findUnique({ where: { id } });
  if (!listing) return;
  await assertCanEdit(listing.tenantId);
  await db.listing.delete({ where: { id } });
  revalidatePath("/panel/listados");
  revalidatePath("/master/inventario");
}

export async function toggleListingStatusAction(formData: FormData) {
  const id = String(formData.get("id"));
  const listing = await db.listing.findUnique({ where: { id } });
  if (!listing) return;
  await assertCanEdit(listing.tenantId);
  await db.listing.update({
    where: { id },
    data: { status: listing.status === "PUBLISHED" ? "PAUSED" : "PUBLISHED" },
  });
  revalidatePath("/panel/listados");
  revalidatePath("/master/inventario");
}

// Solo master: mostrar/ocultar cualquier listado en el marketplace consolidador.
export async function toggleMasterVisibilityAction(formData: FormData) {
  const session = await getSession();
  if (session?.role !== "MASTER") throw new Error("FORBIDDEN");
  const id = String(formData.get("id"));
  const listing = await db.listing.findUnique({ where: { id } });
  if (!listing) return;
  await db.listing.update({ where: { id }, data: { visibleOnMaster: !listing.visibleOnMaster } });
  revalidatePath("/master/inventario");
}

export async function toggleFeaturedAction(formData: FormData) {
  const session = await getSession();
  if (session?.role !== "MASTER") throw new Error("FORBIDDEN");
  const id = String(formData.get("id"));
  const listing = await db.listing.findUnique({ where: { id } });
  if (!listing) return;
  await db.listing.update({ where: { id }, data: { featured: !listing.featured } });
  revalidatePath("/master/inventario");
}
