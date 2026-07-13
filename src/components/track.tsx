"use client";

import { useEffect } from "react";

// Beacon de analytics propio: registra vistas de pagina/listado.
export function Track(props: {
  type: "PAGE_VIEW" | "LISTING_VIEW";
  channel: "MASTER" | "TENANT_SITE";
  tenantId?: string | null;
  listingId?: string | null;
  path?: string;
}) {
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(props),
      signal: controller.signal,
      keepalive: true,
    }).catch(() => {});
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
