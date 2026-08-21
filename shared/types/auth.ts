/**
 * Esquel 2027 — Contrato de autenticación.
 *
 * Flujo: el navegador se autentica SIEMPRE contra Hostinger (PHP 8.x), que emite
 * un par `access` (corto) + `refresh` (largo, rotatorio). El VPS (Colyseus) NO
 * consulta MySQL para autenticar: verifica la firma del `access token` con la
 * clave pública compartida y confía en los claims.
 *
 * Algoritmo: EdDSA (Ed25519) — `alg: "EdDSA"`. PHP firma con la privada,
 * el VPS verifica con la pública publicada en `GET /api/v1/auth/jwks`.
 * No se admite `HS256` (secreto compartido) ni `none`.
 */

import type {
  Barrio,
  CharacterId,
  FactionId,
  GameMode,
  IsoDateTime,
  RankLevel,
  Uuid,
  UserId,
} from './common.ts';

/** Roles de plataforma (no confundir con rangos militantes in-game). */
export const USER_ROLES = ['player', 'sponsor', 'moderator', 'analyst', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Ámbitos otorgados al access token. El VPS exige `game:play` para entrar a una sala. */
export const JWT_SCOPES = [
  'game:play',
  'game:voice',
  'profile:read',
  'profile:write',
  'telemetry:write',
  'sponsor:manage',
  'intel:read',
  'admin:all',
] as const;
export type JwtScope = (typeof JWT_SCOPES)[number];

/** Header JOSE aceptado. */
export interface JwtHeader {
  readonly alg: 'EdDSA';
  readonly typ: 'JWT';
  /** Id de la clave en el JWKS; permite rotación sin downtime. */
  readonly kid: string;
}

/**
 * Payload del **access token**. Es el contrato que consumen tanto el cliente 3D
 * (para pintar el HUD antes del primer snapshot) como el servidor autoritativo.
 * Debe mantenerse por debajo de 900 bytes para caber cómodo en el handshake WS.
 */
export interface UserJWT {
  /** Emisor. Siempre `https://esquel2027.ar` (dominio de Hostinger). */
  readonly iss: string;
  /** Audiencias válidas: API PHP y servidor de juego. */
  readonly aud: readonly ('esquel-api' | 'esquel-realtime')[];
  /** Subject: `usuarios.id` como string decimal. */
  readonly sub: UserId;
  /** JWT ID único; se usa para revocación puntual (denylist en Redis del VPS). */
  readonly jti: Uuid;
  /** Emisión (segundos epoch, según RFC 7519). */
  readonly iat: number;
  /** Expiración (segundos epoch). Access token: `iat + 900` (15 min). */
  readonly exp: number;
  /** No válido antes de (segundos epoch). */
  readonly nbf: number;

  /** Nombre público mostrado sobre el avatar. Único, 3-24 chars. */
  readonly nick: string;
  /** Rol de plataforma. */
  readonly role: UserRole;
  /** Ámbitos concedidos. */
  readonly scopes: readonly JwtScope[];

  /** Personaje activo, si el usuario ya completó la creación. */
  readonly charId?: CharacterId;
  /** Facción actual del personaje activo (`null` lógico = independiente ⇒ ausente). */
  readonly faction?: FactionId;
  /** Nivel de rango militante 1..10, para gating de zonas y misiones. */
  readonly rank?: RankLevel;
  /** Barrio declarado: define spawn por defecto y segmentación de misiones. */
  readonly barrio?: Barrio;
  /** Modo con el que se inició sesión. */
  readonly mode: GameMode;

  /** `true` si aceptó el consentimiento de telemetría analítica (ver `TelemetryEvent`). */
  readonly telemetryConsent: boolean;
  /** Versión del contrato de datos aceptada (permite forzar re-consentimiento). */
  readonly consentVersion: number;

  /** Hash corto (SHA-256, 16 hex) del User-Agent + IP /24: detecta robo de token. */
  readonly bind: string;
}

/** Payload del **refresh token**: mínimo, opaco para el cliente, rotatorio. */
export interface RefreshJWT {
  readonly iss: string;
  readonly aud: readonly ['esquel-api'];
  readonly sub: UserId;
  readonly jti: Uuid;
  readonly iat: number;
  /** `iat + 2_592_000` (30 días). */
  readonly exp: number;
  /** Cadena de rotación: `jti` del token que lo originó. */
  readonly prev?: Uuid;
  readonly bind: string;
}

/** Respuesta de `POST /api/v1/auth/login` y `/auth/refresh`. */
export interface AuthTokenBundle {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly tokenType: 'Bearer';
  /** Segundos de vida restantes del access token. */
  readonly expiresIn: number;
  /** Copia decodificada del payload, para evitar que el cliente lo parsee a mano. */
  readonly claims: UserJWT;
  /** URL del shard de juego asignado (`wss://rt.esquel2027.ar`). */
  readonly realtimeEndpoint: string;
  readonly issuedAt: IsoDateTime;
}

/** Cuerpo de `POST /api/v1/auth/register`. */
export interface RegisterRequest {
  readonly email: string;
  readonly password: string;
  readonly nick: string;
  /** Aceptación explícita de TyC; sin esto PHP responde 422. */
  readonly acceptedTerms: true;
  /** Consentimiento analítico, separado y revocable. */
  readonly telemetryConsent: boolean;
}

/** Cuerpo de `POST /api/v1/auth/login`. */
export interface LoginRequest {
  readonly identifier: string;
  readonly password: string;
  readonly mode?: import('./common.ts').GameMode;
}

/** Handshake que el cliente envía a Colyseus al unirse a una sala. */
export interface RealtimeHandshake {
  readonly accessToken: string;
  /** Versión del bundle del cliente; el VPS rechaza mismatch mayor. */
  readonly clientVersion: string;
  /** Capacidades negociadas (voz espacial, sombras, etc.). */
  readonly capabilities: {
    readonly voice: boolean;
    readonly webgpu: boolean;
    readonly maxDrawDistanceM: number;
  };
}
