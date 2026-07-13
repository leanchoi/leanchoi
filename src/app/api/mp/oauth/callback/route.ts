import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, saveTenantTokens } from "@/server/payments/mp-oauth";

// Callback OAuth: Mercado Pago redirige aca despues de que el vendedor
// autoriza a la plataforma. state = tenantId.
export async function GET(req: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? req.nextUrl.origin;
  const code = req.nextUrl.searchParams.get("code");
  const tenantId = req.nextUrl.searchParams.get("state");

  if (!code || !tenantId) {
    return NextResponse.redirect(`${baseUrl}/panel/pagos?error=oauth_cancelado`);
  }
  try {
    const tokens = await exchangeCodeForTokens(code, baseUrl);
    await saveTenantTokens(tenantId, tokens);
    return NextResponse.redirect(`${baseUrl}/panel/pagos?conectado=1`);
  } catch (err) {
    console.error("[mp oauth]", err);
    return NextResponse.redirect(`${baseUrl}/panel/pagos?error=oauth_fallo`);
  }
}
