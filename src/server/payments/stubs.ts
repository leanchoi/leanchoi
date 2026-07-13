import type { PaymentProvider } from "./provider";

// ── Providers alternativos (enchufables, no activos por defecto) ─────────────
// La evaluacion completa esta en docs/pagos.md. Resumen:
//
//  MODO: no expone API publica directa para ecommerce chico; se integra via
//  agregadores (Payway / Getnet) o plugins de plataformas. Si mas adelante se
//  contrata Payway, implementar aca su checkout y mantener la misma interfaz.
//
//  Cripto (para cobrar en USDT/USDC/BTC en Argentina, opciones confiables):
//   - Sprintcheckout: gateway cripto AR, checkout por QR/API, liquida stablecoins.
//   - Mobbex + Binance Pay: agregador argentino con cripto integrada.
//   - Bitso Business: API enterprise (pay-ins cripto, liquidacion en ARS).
//  Cualquiera de los tres se implementa con createCheckout → redirect URL.

export const modoProvider: PaymentProvider = {
  id: "modo",
  async createCheckout() {
    throw new Error(
      "MODO todavia no esta habilitado. Integrar via Payway/Getnet y completar este provider (ver docs/pagos.md).",
    );
  },
};

export const cryptoProvider: PaymentProvider = {
  id: "crypto",
  async createCheckout() {
    throw new Error(
      "Pagos cripto todavia no habilitados. Opciones evaluadas: Sprintcheckout, Mobbex+Binance Pay, Bitso Business (ver docs/pagos.md).",
    );
  },
};
