# Arquitectura de despliegue dual — Hostinger + VPS

> **Estado:** PROMPT 0 · versión 1.0.0

## 1. Por qué dos entornos

Hostinger (PHP + MySQL) es barato, estable y ya resuelve dominio, TLS, correo y
backups: perfecto para identidad, datos y contenido estático. Lo que **no** puede
hacer es sostener conexiones WebSocket de larga duración con un bucle de simulación a
20 Hz. Eso vive en un VPS Linux con Node.

La división es tajante:

| | Hostinger | VPS |
|---|---|---|
| **Qué corre** | Landing, bundle WebGL, API REST, MySQL | Colyseus, simulación, señalización WebRTC |
| **Autoridad sobre** | Identidad, perfiles, persistencia, inteligencia | Estado del mundo en vivo |
| **Latencia objetivo** | < 300 ms (no crítica) | < 80 ms al AMBA / < 140 ms a Chubut |
| **Escala** | Vertical, la del plan | Horizontal por shards |
| **Si se cae** | No se puede entrar; los que están adentro siguen jugando | Se cae el mundo, la cuenta sobrevive |

```
                        ┌──────────────────────────────┐
                        │   Navegador · Cliente 3D     │
                        │   Three.js · WebGL · WebRTC  │
                        └───────┬──────────────┬───────┘
                 HTTPS/REST     │              │   WSS + WebRTC
                                ▼              ▼
        ┌───────────────────────────────┐   ┌──────────────────────────────┐
        │  HOSTINGER — PHP 8.x + MySQL  │   │  VPS LINUX — Node + Colyseus │
        │                               │   │                              │
        │  · Landing y bundle estático  │   │  · CityRoom (shard)          │
        │  · Registro / login / JWT     │   │  · Simulación 20 Hz          │
        │  · Perfiles y personajes      │   │  · Misiones Live-Ops         │
        │  · Ingesta de telemetría      │   │  · Territorio y duelos       │
        │  · Agregados de inteligencia  │   │  · Relay de señalización voz │
        │  · Panel de sponsors          │   │  · Redis (presencia, denylist)│
        └───────────────┬───────────────┘   └───────────────┬──────────────┘
                        │                                   │
                        │   ①  JWKS (clave pública EdDSA)   │
                        │   ②  Persistencia diferida (REST) │
                        └───────────────────────────────────┘
```

**① JWKS.** El VPS descarga `GET /api/v1/auth/jwks` y cachea la clave pública 10 min.
Valida los access tokens localmente: cero consultas a MySQL para autenticar.

**② Persistencia diferida.** El VPS no toca MySQL. Envía lotes firmados
(`POST /api/v1/internal/persist`, HMAC + IP allowlist) cada 30 s y al desconectar a un
jugador. Si Hostinger no responde, el lote se encola en Redis y se reintenta con
backoff: la partida no se frena porque el hosting esté lento.

## 2. Superficie de API REST (contrato de la Fase 1)

Prefijo `/api/v1`. Todas las respuestas usan `ApiError` en el camino de error.

### Autenticación
| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/auth/register` | Alta con email, nick, TyC y consentimiento analítico |
| `POST` | `/auth/login` | Devuelve `AuthTokenBundle` |
| `POST` | `/auth/refresh` | Rotación de refresh token; detecta reuso |
| `POST` | `/auth/logout` | Revoca la cadena de tokens |
| `GET` | `/auth/jwks` | Clave pública EdDSA (la consume el VPS) |

### Jugador
| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/me` | Cuenta, perfil demográfico y personajes |
| `POST` | `/me/onboarding` | Onboarding de 30 s (edad, género, barrio, interés) |
| `PATCH` | `/me/consent` | Alta/baja del consentimiento analítico |
| `DELETE` | `/me/telemetry` | Borra los eventos del sujeto y recalcula agregados |
| `POST` | `/characters` | Crea personaje (nick, apariencia, barrio) |
| `GET` | `/characters/{id}` | `CharacterPersistence` |
| `PATCH` | `/characters/{id}/faction` | Afiliación, con penalización de lealtad |
| `GET` | `/characters/{id}/history` | Historial de misiones paginado |

### Mundo y contenido
| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/world/shards` | `ShardSummary[]` para el selector |
| `GET` | `/world/prefabs/index?shard=` | Índice liviano de prefabs (< 200 KB, cacheable) |
| `GET` | `/world/weather` | Último clima normalizado (respaldo si el VPS está caído) |
| `GET` | `/catalog/cards` · `/catalog/items` · `/catalog/quests` | Catálogos versionados con `ETag` |
| `POST` | `/prefabs/contributions` | Alta de contribución de fachada con fotos |

### Telemetría e inteligencia
| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/telemetry/batch` | Hasta 50 eventos, 64 KB, firmados con la clave de sesión |
| `GET` | `/intel/vote-intention` | Serie diaria (rol `analyst`; sólo celdas publicables) |
| `GET` | `/intel/sentiment` | Mapa por barrio y tema |
| `GET` | `/sponsors/{id}/report` | Rendimiento del comercio (rol `sponsor` dueño de la ficha) |

### Interno (VPS → PHP, nunca expuesto al navegador)
| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/internal/persist` | Lote de estados de personaje, misiones y duelos |
| `POST` | `/internal/telemetry` | Relay de eventos generados del lado del servidor |
| `GET` | `/internal/liveops/news` | Señales de noticias pendientes de procesar |

## 3. Flujos principales

**Ingreso a partida**

1. El navegador hace login contra Hostinger → `AuthTokenBundle` (access 15 min).
2. Descarga el bundle y el índice de prefabs del shard.
3. Abre WSS contra el VPS con `RealtimeHandshake` (access token + versión + capacidades).
4. El VPS valida la firma con el JWKS cacheado, chequea el ámbito `game:play`,
   consulta a PHP el `CharacterPersistence` (una sola vez) y hace spawn.
5. Emite `S2CWelcome` y arranca la replicación de estado.

**Persistencia**

El estado vive en memoria del VPS. Se vuelca a MySQL cada 30 s, al desconectar y
ante cada evento de valor (ascenso, cierre de misión, resultado de duelo). Si el VPS
muere sin volcar, se pierde a lo sumo medio minuto de progreso — asumido y
documentado.

**Voz espacial**

El VPS calcula qué pares están dentro del radio audible y emite `S2CVoicePeers` con
la ganancia y el paneo sugeridos. La señalización (SDP/ICE) pasa por el VPS como
relay ciego. **El audio nunca pasa por el servidor**: es P2P, malla hasta 8 pares;
por encima de eso el shard degrada a SFU (Fase 3).

**Fachadas modulares**

Fotos → `/prefabs/contributions` → cola de revisión → `prefab-importer` genera el
voxel → validación contra el JSON Schema → aprobación humana → `activo = 1`. La
columna generada `parcela_activa` garantiza en la base que haya **un solo prefab
activo por parcela**, así que reemplazar el genérico no puede romper la cuadrícula.

## 4. Escalado

- **Shard** = una `CityRoom` = 120 jugadores (`NET.MAX_PLAYERS_PER_ROOM`). Al 85% de
  aforo, el lobby abre un shard nuevo.
- Un VPS de 4 vCPU / 8 GB sostiene ~4 shards (≈480 jugadores) con margen. Colyseus
  es de un solo hilo por proceso: se escala con más procesos, no con más hilos.
- Redis guarda presencia entre shards, denylist de `jti` revocados y la cola de
  persistencia.
- El interés (AOI) de 120 m recorta la replicación: un jugador recibe ~15-25 pares,
  no los 120 del shard.

## 5. Seguridad

| Riesgo | Mitigación |
|---|---|
| Robo de access token | Vida de 15 min, claim `bind` (UA + IP/24), denylist de `jti` en Redis |
| Reuso de refresh token | Rotación con cadena `jti_previo`: reuso detectado ⇒ se revoca la cadena entera |
| Speed hack / teleport | El servidor valida contra `MOVEMENT.MAX_PLAUSIBLE_SPEED` y corrige con `S2CReconcile` |
| Inyección de telemetría | Allow-list de nombres de evento, HMAC de lote, límite de tamaño, deduplicación por `evento_id` |
| Spam de intents | 30 intents/s por jugador; excederlo desconecta |
| Fotos con personas identificables | Difuminado obligatorio antes de almacenar; revisión humana previa a publicar |
| Datos personales en telemetría | Seudónimo rotativo, k-anonimato ≥ 15, sin PII por contrato (ver [privacidad](privacidad-telemetria.md)) |

## 6. Entornos

| Entorno | Hostinger | VPS | Base |
|---|---|---|---|
| `dev` | local (`php -S`) | local (`tsx watch`) | MySQL/MariaDB local |
| `staging` | subdominio `stg.` | mismo VPS, puerto alterno | esquema `esquel_stg` |
| `prod` | dominio principal | VPS dedicado + PM2 | esquema `esquel2027` |

Variables por entorno en `backend-php/config/` (nunca versionadas) y en el `.env` del
VPS. `.env.example` documenta cada clave sin valores reales.
