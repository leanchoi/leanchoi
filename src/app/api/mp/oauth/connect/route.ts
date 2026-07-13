import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { mpAuthorizationUrl } from "@/server/payments/mp-oauth";

// Inicia la vinculacion OAuth del vendedor con Mercado Pago.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "TENANT_ADMIN" || !session.tenantId) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? req.nextUrl.origin;
  const url = mpAuthorizationUrl(session.tenantId, baseUrl);
  if (!url) {
    return NextResponse.redirect(new URL("/panel/pagos?error=sin_credenciales_marketplace", baseUrl));
  }
  return NextResponse.redirect(url);
}
