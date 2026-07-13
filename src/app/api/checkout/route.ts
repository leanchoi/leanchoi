import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createCheckout } from "@/server/checkout";

const schema = z.object({
  listingId: z.string(),
  slotId: z.string().optional(),
  quantity: z.number().int().min(1).max(20).default(1),
  customerName: z.string().min(2),
  customerEmail: z.string().email(),
  customerPhone: z.string().optional(),
  channel: z.enum(["MASTER", "TENANT_SITE"]).default("MASTER"),
});

export async function POST(req: NextRequest) {
  try {
    const body = schema.parse(await req.json());
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? req.nextUrl.origin;
    const result = await createCheckout(body, baseUrl);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al iniciar el pago";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
