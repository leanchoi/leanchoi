import type { ConnectorStatus, ExternalProduct, OtaConnector } from "./types";

// ── Viator (Tripadvisor) — la mejor puerta de entrada ────────────────────────
// Affiliate API con acceso "basic" SIN pre-aprobacion: catalogos, precios y
// links con tracking de comision. Con "full + booking" se puede reservar
// dentro de la plataforma. Merchant API: nosotros somos merchant of record.
const viator: OtaConnector = {
  id: "viator",
  name: "Viator / Tripadvisor",
  capability:
    "Affiliate API (basic access sin aprobacion previa) para catalogo + links comisionables. Upgrade a booking o merchant.",
  docsUrl: "https://docs.viator.com/partner-api/",
  status: () => (process.env.VIATOR_API_KEY ? "ready" : "needs_credentials"),
  async search(query: string): Promise<ExternalProduct[]> {
    const key = process.env.VIATOR_API_KEY;
    if (!key) return [];
    const res = await fetch("https://api.viator.com/partner/products/search", {
      method: "POST",
      headers: {
        "exp-api-key": key,
        Accept: "application/json;version=2.0",
        "Accept-Language": "es-AR",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        searchTerm: query,
        currency: "USD",
        pagination: { start: 1, count: 20 },
      }),
    });
    if (!res.ok) throw new Error(`Viator ${res.status}`);
    const data = await res.json();
    return (data.products ?? []).map((p: any) => ({
      externalId: p.productCode,
      title: p.title,
      description: p.description ?? "",
      priceCents: Math.round((p.pricing?.summary?.fromPrice ?? 0) * 100),
      currency: p.pricing?.currency ?? "USD",
      images: (p.images ?? [])
        .flatMap((img: any) => img.variants?.slice(-1) ?? [])
        .map((v: any) => v.url)
        .slice(0, 4),
      location: p.destinations?.[0]?.name,
      durationMinutes: p.duration?.fixedDurationInMinutes,
      category: "Tours",
      affiliateUrl: p.productUrl,
    }));
  },
};

const getyourguide: OtaConnector = {
  id: "getyourguide",
  name: "GetYourGuide",
  capability:
    "Para VENDER inventario de GYG: programa de afiliados (widgets/links). Su Partner API de distribucion requiere acuerdo comercial. Para DISTRIBUIR tu inventario en GYG: hay que exponer una Supplier API propia (endpoints de disponibilidad/reserva).",
  docsUrl: "https://code.getyourguide.com/partner-api-spec/",
  status: () => (process.env.GYG_PARTNER_ID ? "affiliate_only" : "needs_credentials"),
};

const klook: OtaConnector = {
  id: "klook",
  name: "Klook",
  capability: "Programa de afiliados (2-5% por venta) con links y widgets. API transaccional solo para partners grandes.",
  docsUrl: "https://affiliate.klook.com/",
  status: () => "affiliate_only",
};

const civitatis: OtaConnector = {
  id: "civitatis",
  name: "Civitatis",
  capability:
    "Programa de afiliados fuerte en LATAM/España con API y widgets para integrar su catalogo. Ideal para el mercado hispano.",
  docsUrl: "https://www.civitatis.com/es/afiliados/",
  status: () => (process.env.CIVITATIS_AFFILIATE_ID ? "ready" : "needs_credentials"),
};

const musement: OtaConnector = {
  id: "musement",
  name: "TUI Musement",
  capability: "Programa de afiliados (7% fijo o revenue share). API B2B completa solo con acuerdo comercial TUI.",
  docsUrl: "https://affiliate.musement.com/",
  status: () => "affiliate_only",
};

const bookingCom: OtaConnector = {
  id: "booking",
  name: "Booking.com",
  capability:
    "Demand API V3 (incluye atracciones) solo para partners aprobados con volumen. Alternativa corta: afiliado tradicional.",
  docsUrl: "https://partnerships.booking.com/api-v3",
  status: () => "not_available",
};

const tripadvisor: OtaConnector = {
  id: "tripadvisor",
  name: "Tripadvisor Content API",
  capability:
    "Solo CONTENIDO (reviews, ratings, fotos) para enriquecer fichas. La venta de actividades de Tripadvisor se hace via Viator (mismo grupo).",
  docsUrl: "https://developer-tripadvisor.com/content-api/",
  status: () => "affiliate_only",
};

const despegar: OtaConnector = {
  id: "despegar",
  name: "Despegar",
  capability: "Programa de afiliados con API key (registro y validacion en ~48h). Fuerte en Argentina.",
  docsUrl: "https://dev.despegar.com/",
  status: () => "needs_credentials",
};

const atrapalo: OtaConnector = {
  id: "atrapalo",
  name: "Atrápalo",
  capability: "Afiliacion por contacto directo (afiliados@atrapalo.com). Sin API publica.",
  docsUrl: "https://www.atrapalo.com/",
  status: () => "not_available",
};

export const CONNECTORS: OtaConnector[] = [
  viator,
  getyourguide,
  klook,
  civitatis,
  musement,
  bookingCom,
  tripadvisor,
  despegar,
  atrapalo,
];

export function connectorStatusLabel(status: ConnectorStatus): string {
  switch (status) {
    case "ready":
      return "Configurado";
    case "needs_credentials":
      return "Falta credencial";
    case "affiliate_only":
      return "Solo afiliado";
    case "not_available":
      return "Requiere acuerdo";
  }
}
