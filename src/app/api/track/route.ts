import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

const schema = z.object({
  type: z.enum(["PAGE_VIEW", "LISTING_VIEW"]),
  tenantId: z.string().nullable().optional(),
  channel: z.enum(["MASTER", "TENANT_SITE"]),
  listingId: z.string().nullable().optional(),
  path: z.string().max(300).optional(),
});

// Beacon liviano de analytics propio (alimenta los insights).
export async function POST(req: NextRequest) {
  try {
    const body = schema.parse(await req.json());
    await db.trackEvent.create({
      data: {
        type: body.type,
        tenantId: body.tenantId ?? null,
        channel: body.channel,
        listingId: body.listingId ?? null,
        path: body.path,
      },
    });
  } catch {
    // los errores de tracking nunca rompen la navegacion
  }
  return NextResponse.json({ ok: true });
}
