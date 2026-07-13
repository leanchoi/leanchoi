import "server-only";
import { db } from "@/lib/db";

// ── OAuth de Mercado Pago para vincular vendedores al marketplace ────────────
// Cada dueño de pagina independiente autoriza a la plataforma UNA sola vez
// desde su panel (Pagos → "Conectar Mercado Pago"). A partir de ahi cobra
// directo en su cuenta y el fee del master se separa automaticamente.
// Docs: https://www.mercadopago.com.ar/developers/es/docs/security/oauth/creation

const AUTH_BASE = "https://auth.mercadopago.com.ar/authorization";
const TOKEN_URL = "https://api.mercadopago.com/oauth/token";

export function mpAuthorizationUrl(tenantId: string, baseUrl: string): string | null {
  const clientId = process.env.MP_CLIENT_ID;
  if (!clientId) return null;
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    platform_id: "mp",
    state: tenantId,
    redirect_uri: `${baseUrl}/api/mp/oauth/callback`,
  });
  return `${AUTH_BASE}?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  public_key?: string;
  user_id?: number;
  expires_in?: number;
};

export async function exchangeCodeForTokens(code: string, baseUrl: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.MP_CLIENT_ID,
      client_secret: process.env.MP_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: `${baseUrl}/api/mp/oauth/callback`,
    }),
  });
  if (!res.ok) throw new Error(`OAuth MP fallo: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function saveTenantTokens(tenantId: string, tokens: TokenResponse) {
  await db.tenant.update({
    where: { id: tenantId },
    data: {
      mpAccessToken: tokens.access_token,
      mpRefreshToken: tokens.refresh_token ?? null,
      mpPublicKey: tokens.public_key ?? null,
      mpUserId: tokens.user_id ? String(tokens.user_id) : null,
      mpConnectedAt: new Date(),
      mpTokenExpiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
    },
  });
}

// Los access tokens de MP vencen a los ~180 dias; refrescamos on-demand.
export async function refreshTenantTokenIfNeeded(tenantId: string): Promise<string | null> {
  const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant?.mpAccessToken) return null;
  const expiresSoon =
    tenant.mpTokenExpiresAt && tenant.mpTokenExpiresAt.getTime() - Date.now() < 1000 * 60 * 60 * 24 * 7;
  if (!expiresSoon || !tenant.mpRefreshToken) return tenant.mpAccessToken;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.MP_CLIENT_ID,
      client_secret: process.env.MP_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: tenant.mpRefreshToken,
    }),
  });
  if (!res.ok) return tenant.mpAccessToken;
  const tokens: TokenResponse = await res.json();
  await saveTenantTokens(tenantId, tokens);
  return tokens.access_token;
}
