// Conectores a OTAs (Viator, GetYourGuide, Klook, Civitatis, Musement...).
// Investigacion completa y estrategia por plataforma: docs/integraciones-ota.md

export type ExternalProduct = {
  externalId: string;
  title: string;
  description: string;
  priceCents: number;
  currency: string;
  images: string[];
  location?: string;
  durationMinutes?: number;
  category: string;
  affiliateUrl?: string;
};

export type ConnectorStatus = "ready" | "needs_credentials" | "affiliate_only" | "not_available";

export interface OtaConnector {
  id: string;
  name: string;
  // que permite hoy la plataforma externa, con honestidad
  capability: string;
  docsUrl: string;
  status(): ConnectorStatus;
  // buscar productos en la OTA para importarlos como listados del master
  search?(query: string, destination?: string): Promise<ExternalProduct[]>;
}
