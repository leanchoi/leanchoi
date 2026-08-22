/**
 * Sesión: el puente con Hostinger.
 *
 * El navegador se autentica **siempre** contra la API PHP y recibe un JWT; con
 * ese token abre el WebSocket contra el VPS. Acá vive todo lo que toca esa API:
 * registro rápido, login y persistencia local del token.
 *
 * El token se guarda en `localStorage` a propósito y no en una cookie: el bundle
 * lo tiene que leer para pasárselo a Colyseus en el handshake, así que una cookie
 * `httpOnly` no serviría. Dura quince minutos y no da acceso a nada fuera del
 * juego.
 */

import type { Barrio } from '@esquel/shared';
import { CONFIG } from '../config.ts';

const STORAGE_KEY = 'esquel2027.sesion';

export interface SesionJugador {
  readonly userId: string;
  readonly characterId: string;
  readonly alias: string;
  readonly factionId: number;
  readonly rankTier: number;
  readonly barrio: Barrio;
  readonly xp?: number;
  readonly reputacion?: number;
  readonly guitaCentavos?: number;
}

export interface Sesion {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresIn: number;
  readonly realtimeEndpoint: string;
  readonly player: SesionJugador;
  /** Momento en que se obtuvo, para saber si venció. */
  readonly obtenidaEn: number;
}

export interface DatosRegistro {
  readonly alias: string;
  readonly password: string;
  readonly edad: number;
  readonly genero: string;
  readonly barrio: string;
  readonly faccionId: number;
  readonly interesPolitico: string;
  readonly telemetria: boolean;
}

export class ApiError extends Error {
  readonly code: string;
  readonly fields: Record<string, string>;

  constructor(code: string, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.fields = fields;
  }
}

const post = async <T>(ruta: string, body: unknown): Promise<T> => {
  const respuesta = await fetch(`${CONFIG.api.baseUrl}${ruta}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  const texto = await respuesta.text();
  let data: unknown;
  try {
    data = texto ? JSON.parse(texto) : {};
  } catch {
    throw new ApiError('RESPUESTA_INVALIDA', `El servidor respondió algo que no es JSON (HTTP ${respuesta.status}).`);
  }

  if (!respuesta.ok) {
    const error = data as { code?: string; message?: string; fields?: Record<string, string> };
    throw new ApiError(
      error.code ?? 'ERROR',
      error.message ?? `La API respondió ${respuesta.status}.`,
      error.fields ?? {},
    );
  }

  return data as T;
};

interface RespuestaAuth {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  realtimeEndpoint: string;
  player: SesionJugador;
}

const guardar = (respuesta: RespuestaAuth): Sesion => {
  const sesion: Sesion = { ...respuesta, obtenidaEn: Date.now() };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sesion));
  } catch {
    // Modo incógnito o storage lleno: la sesión vive sólo en memoria.
  }
  return sesion;
};

/** Onboarding rápido: alias, contraseña y cuatro datos. */
export const registrar = async (datos: DatosRegistro): Promise<Sesion> =>
  guardar(await post<RespuestaAuth>('/auth/register.php', datos));

/** Entrar con una cuenta que ya existe. */
export const entrar = async (identifier: string, password: string): Promise<Sesion> =>
  guardar(await post<RespuestaAuth>('/auth/login.php', { identifier, password }));

/** Recupera la sesión guardada, si sigue vigente. */
export const sesionGuardada = (): Sesion | null => {
  // Un token por querystring gana: sirve para QA y para las pruebas automáticas.
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      return {
        accessToken: token,
        refreshToken: '',
        expiresIn: 900,
        // `?rt=` permite apuntar a un servidor local sin recompilar el bundle.
        realtimeEndpoint: params.get('rt') ?? CONFIG.api.realtimeUrl,
        player: {
          userId: '0',
          characterId: '0',
          alias: params.get('alias') ?? 'Vecino',
          factionId: Number(params.get('faccion') ?? 0),
          rankTier: Number(params.get('rango') ?? 1),
          barrio: (params.get('barrio') ?? 'centro') as Barrio,
        },
        obtenidaEn: Date.now(),
      };
    }
  }

  try {
    const crudo = localStorage.getItem(STORAGE_KEY);
    if (!crudo) return null;
    const sesion = JSON.parse(crudo) as Sesion;
    const vencida = Date.now() - sesion.obtenidaEn > (sesion.expiresIn - 60) * 1000;
    if (vencida) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return sesion;
  } catch {
    return null;
  }
};

export const cerrarSesion = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nada que borrar */
  }
};
