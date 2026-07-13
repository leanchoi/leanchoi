"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

async function assertOwnListing(listingId: string) {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHORIZED");
  const listing = await db.listing.findUnique({ where: { id: listingId } });
  if (!listing) throw new Error("No existe el listado");
  if (session.role !== "MASTER" && listing.tenantId !== session.tenantId) throw new Error("FORBIDDEN");
  return listing;
}

// Genera horarios en lote: rango de fechas + dias de semana + hora + cupo.
export async function generateSlotsAction(formData: FormData) {
  const listingId = String(formData.get("listingId"));
  const listing = await assertOwnListing(listingId);

  const from = new Date(String(formData.get("from")));
  const to = new Date(String(formData.get("to")));
  const time = String(formData.get("time") ?? "10:00");
  const capacity = Number(formData.get("capacity")) || listing.capacityPerSlot || 10;
  const weekdays = formData.getAll("weekdays").map(Number); // 0=domingo
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || weekdays.length === 0) {
    throw new Error("Completá fechas y días de semana");
  }
  const [hours, minutes] = time.split(":").map(Number);

  const slots: { listingId: string; startsAt: Date; capacity: number }[] = [];
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    if (!weekdays.includes(d.getDay())) continue;
    const startsAt = new Date(d);
    startsAt.setHours(hours ?? 10, minutes ?? 0, 0, 0);
    if (startsAt < new Date()) continue;
    slots.push({ listingId, startsAt, capacity });
  }

  // evitar duplicados exactos
  const existing = await db.availabilitySlot.findMany({
    where: { listingId, startsAt: { in: slots.map((s) => s.startsAt) } },
    select: { startsAt: true },
  });
  const taken = new Set(existing.map((e) => e.startsAt.getTime()));
  const fresh = slots.filter((s) => !taken.has(s.startsAt.getTime()));
  if (fresh.length > 0) await db.availabilitySlot.createMany({ data: fresh });

  revalidatePath("/panel/disponibilidad");
}

export async function deleteSlotAction(formData: FormData) {
  const id = String(formData.get("id"));
  const slot = await db.availabilitySlot.findUnique({ where: { id } });
  if (!slot) return;
  await assertOwnListing(slot.listingId);
  if (slot.booked > 0) throw new Error("No se puede borrar un horario con reservas");
  await db.availabilitySlot.delete({ where: { id } });
  revalidatePath("/panel/disponibilidad");
}
