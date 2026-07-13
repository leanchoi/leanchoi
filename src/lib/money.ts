// Todo el dinero se maneja en centavos (enteros) para evitar errores de flotante.

export function formatMoney(cents: number, currency = "ARS"): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function formatCompact(cents: number): string {
  const pesos = cents / 100;
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(pesos);
}

export const DEFAULT_COMMISSION_PCT = 10;

export function splitOrder(subtotalCents: number, commissionPct: number | null | undefined, masterOwned: boolean) {
  if (masterOwned) {
    return { commissionCents: 0, sellerCents: subtotalCents };
  }
  const pct = commissionPct ?? DEFAULT_COMMISSION_PCT;
  const commissionCents = Math.round((subtotalCents * pct) / 100);
  return { commissionCents, sellerCents: subtotalCents - commissionCents };
}
