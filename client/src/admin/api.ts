/**
 * Cliente del Dashboard de Campaña.
 *
 * Habla con dos servidores distintos y conviene tener claro cuál para qué:
 *
 *   Hostinger (PHP)  → el histórico: intención de voto, tendencia, misiones,
 *                      comercios. Todo con k-anonimato ya aplicado.
 *   VPS (Colyseus)   → el ahora: quién está conectado, cómo viene el pueblo en
 *                      esta ventana, y la consola de Live-Ops.
 *
 * El token es el mismo para los dos: lo emite `/api/admin/login.php` y el VPS lo
 * verifica con el secreto compartido. Un solo emisor de identidad.
 */

import type { DashboardSnapshot, LiveOpsCommand, LiveOpsResult } from '@esquel/shared';
import { CONFIG } from '../config.ts';

const STORAGE_KEY = 'esquel2027.admin';

export interface AdminSession {
  readonly token: string;
  readonly alias: string;
  readonly role: string;
  readonly expiresIn: number;
  readonly realtimeEndpoint: string;
  readonly obtenidaEn: number;
}

export class AdminError extends Error {
  readonly status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = 'AdminError';
    this.status = status;
  }
}

/** Endpoint HTTP del VPS. El realtime viaja por `wss://`; esto es el `https://`. */
const vpsHttp = (session: AdminSession): string =>
  (session.realtimeEndpoint || CONFIG.api.realtimeUrl).replace(/^ws/, 'http').replace(/\/$/, '');

/* --- sesión --------------------------------------------------------------- */

export const guardarSesion = (s: AdminSession): AdminSession => {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Modo incógnito: la sesión vive sólo en memoria y se pierde al recargar.
  }
  return s;
};

export const sesionAdmin = (): AdminSession | null => {
  try {
    const crudo = sessionStorage.getItem(STORAGE_KEY);
    if (!crudo) return null;
    const s = JSON.parse(crudo) as AdminSession;
    if (Date.now() - s.obtenidaEn > (s.expiresIn - 60) * 1000) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
};

export const salir = (): void => {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nada que borrar */
  }
};

/* --- llamadas -------------------------------------------------------------- */

export const entrarAlPanel = async (credenciales: {
  identifier?: string;
  password?: string;
  masterPassword?: string;
}): Promise<AdminSession> => {
  const res = await fetch(`${CONFIG.api.baseUrl}/admin/login.php`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(credenciales),
  });
  const data = (await res.json().catch(() => ({}))) as {
    token?: string;
    alias?: string;
    role?: string;
    expiresIn?: number;
    realtimeEndpoint?: string;
    message?: string;
  };
  if (!res.ok || !data.token) {
    throw new AdminError(data.message ?? 'No se pudo abrir el panel.', res.status);
  }
  return guardarSesion({
    token: data.token,
    alias: data.alias ?? 'admin',
    role: data.role ?? 'admin',
    expiresIn: data.expiresIn ?? 28_800,
    realtimeEndpoint: data.realtimeEndpoint ?? CONFIG.api.realtimeUrl,
    obtenidaEn: Date.now(),
  });
};

/** Foto consolidada del histórico. `dias` es la ventana de agregación. */
export const traerMetricas = async (session: AdminSession, dias = 7): Promise<DashboardSnapshot> => {
  const res = await fetch(`${CONFIG.api.baseUrl}/intelligence/metrics.php?dias=${dias}`, {
    headers: { authorization: `Bearer ${session.token}` },
  });
  if (!res.ok) {
    throw new AdminError(`La API respondió ${res.status}.`, res.status);
  }
  return (await res.json()) as DashboardSnapshot;
};

export interface LiveIntelResponse {
  readonly ok: boolean;
  readonly shards: number;
  readonly online: number;
  readonly rooms: readonly {
    readonly shard: string;
    readonly subjects: number;
    readonly heat: readonly { barrio: string; militancy: number; subjects: number; publishable: boolean }[];
    readonly bySignal: Readonly<Record<string, number>>;
  }[];
}

/** Lo que está pasando ahora mismo en el shard. Puede fallar: el VPS no siempre está. */
export const traerEnVivo = async (session: AdminSession): Promise<LiveIntelResponse> => {
  const res = await fetch(`${vpsHttp(session)}/intel/live`, {
    headers: { authorization: `Bearer ${session.token}` },
  });
  if (!res.ok) {
    throw new AdminError(`El shard respondió ${res.status}.`, res.status);
  }
  return (await res.json()) as LiveIntelResponse;
};

/** Dispara un comando de Live-Ops contra el shard. */
export const dispararLiveOps = async (
  session: AdminSession,
  command: LiveOpsCommand,
): Promise<readonly LiveOpsResult[]> => {
  const res = await fetch(`${vpsHttp(session)}/intel/liveops`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${session.token}` },
    body: JSON.stringify({ command }),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; results?: LiveOpsResult[]; error?: string };
  if (!res.ok) {
    throw new AdminError(data.error ?? `El shard respondió ${res.status}.`, res.status);
  }
  return data.results ?? [];
};
