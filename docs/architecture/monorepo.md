# Estructura del monorepo — Esquel 2027

> **Estado:** PROMPT 0 · versión 1.0.0
> Leyenda: **✅ entregado en PROMPT 0** · 🔜 planificado (fase indicada)

Cuatro paquetes con responsabilidades que no se solapan y un contrato compartido
que los tres primeros importan. La regla que gobierna todo el árbol:

> **Nada de lógica de juego duplicada.** Si una fórmula la necesitan el cliente y el
> servidor, vive en `/shared`. Si además la necesita PHP, vive en `/shared` y PHP la
> replica con un test de paridad que compara salidas.

```
esquel-2027/
├── client/          Cliente 3D voxel (navegador)          → bundle estático en Hostinger
├── server-vps/      Servidor autoritativo (Node+Colyseus) → VPS Linux
├── backend-php/     API REST, identidad y datos (PHP 8)   → Hostinger
├── shared/          Contratos, constantes y fórmulas      → importado por los tres
├── tools/           Pipelines e integridad (Node CLI)     → local / CI
├── docs/            Diseño, arquitectura y operación
└── .github/         CI
```

---

## `/shared` — el contrato inamovible ✅

Fuente de verdad de tipos, números y fórmulas. **No tiene dependencias de runtime**:
se consume como TypeScript fuente (Vite lo transpila, el VPS usa `tsx`/`tsc`, y Node
≥22.6 puede ejecutarlo directo con `--experimental-strip-types`). Por eso todos los
imports relativos llevan extensión `.ts` explícita.

| Ruta | Responsabilidad |
|---|---|
| `types/common.ts` ✅ | Branded IDs, escalares de dominio, geometría, enums base (barrios, rangos, clima) y reglas de serialización (BIGINT como string, dinero en centavos, tiempo ISO-8601 UTC) |
| `types/auth.ts` ✅ | `UserJWT`, `RefreshJWT`, `AuthTokenBundle`, handshake de sala. Firma EdDSA, `HS256` y `none` prohibidos |
| `types/player.ts` ✅ | `PlayerState` replicado, vitales, progresión, buffs, inventario, voz, `StatDelta` |
| `types/world.ts` ✅ | `WorldState`, reloj solar, clima, zonas de territorio, NPCs, marquesinas, ancla georreferenciada |
| `types/debate.ts` ✅ | `DebateCard`, rueda de familias, `DebateDuel`, log y resultado |
| `types/quests.ts` ✅ | `LiveQuest`, las 10 tipologías, objetivos, `NewsSignal`, registro persistido |
| `types/telemetry.ts` ✅ | `TelemetryEvent` (unión discriminada por evento), contexto de segmento, salidas agregadas, `K_ANON_MIN` |
| `types/building.ts` ✅ | `BuildingPrefabMeta` y el pipeline de fachadas modulares |
| `constants/ranks.ts` ✅ | Los 10 rangos con su curva. **Fuente de verdad** del seed SQL |
| `constants/world.ts` ✅ | Ancla geográfica de Esquel, métrica de la cuadrícula, POIs, barrios, zonas |
| `constants/factions.ts` ✅ | Facciones ficticias + política editorial vinculante |
| `constants/balance.ts` ✅ | **Todos** los tunables de gameplay. Ningún magic number fuera de acá |
| `util/balance.ts` ✅ | Curva de XP, ascensos, reputación, recompensa de misión con desglose |
| `util/debate.ts` ✅ | Resolución de cartas, dominancia, recompensas, validación de mazo |
| `util/territory.ts` ✅ | Presencia, saturación, cohesión, captura, ganancia de voz por distancia |
| `util/geo.ts` ✅ | Conversión lat/lon ↔ mundo ↔ celda; ids de parcela |
| `util/time.ts` ✅ | Reloj de Esquel (UTC-3), posición solar NOAA, fases del día |
| `util/rng.ts` ✅ | RNG determinista (mulberry32) para duelos y generación de misiones |
| `protocol/index.ts` ✅ | Mensajes `C2S_*` / `S2C_*` y `ProtocolMap` tipado |
| `schemas/building-prefab.schema.json` ✅ | JSON Schema 2020-12 del prefab, con sus ejemplos validados |

## `/client` — cliente 3D voxel ✅ (Fase 1)

React Three Fiber + Vite. Compila a estático y se sube a Hostinger. **No decide
nada**: predice movimiento, interpola estado y muestra. Todo el trabajo pesado vive
en clases fuera de React; los componentes sólo las montan y las conectan al bucle.

| Ruta | Responsabilidad | Estado |
|---|---|---|
| `src/main.tsx` · `src/App.tsx` | Punto de entrada, canvas, parámetros de URL (`?hora`, `?spawn`, `?hud`, `?dpr`) | ✅ |
| `src/config.ts` | Único lector de `import.meta.env`: clima, API, fecha del comicio, presupuesto de render | ✅ |
| `src/engine/VoxelTypes.ts` | `VoxelBox`, `Collider`, `VoxelBuilder`: el modelo de datos del motor | ✅ |
| `src/engine/VoxelPalette.ts` | Paleta cordillerana y mezcla de colores | ✅ |
| `src/engine/ChunkManager.ts` | Una manzana = un chunk = dos `InstancedMesh`. Suelo, veredas, asfalto, sendas, arbolado, alumbrado y construcción incremental con presupuesto por cuadro | ✅ |
| `src/engine/VoxelWorld.ts` | Fachada del motor: chunks + cerros + registro de fachadas | ✅ |
| `src/engine/MountainBackdrop.ts` | Siluetas de La Hoya, Cerro 21 y La Zeta, con nieve y tinte solar | ✅ |
| `src/engine/Vegetation.ts` | Álamos, pinos y arbustos de estepa en bloques | ✅ |
| `src/world/EsquelStreetGrid.ts` | Traza urbana: calles reales, parcelas, resolución de direcciones (`San Martín 650` → parcela) y descripción de posición | ✅ |
| `src/world/ProceduralBuildings.ts` | Casas patagónicas, comercios, edificios de esquina, galpones, baldíos y la Plaza San Martín | ✅ |
| `src/world/buildings/PrefabRegistry.ts` | Índice de fachadas reales, descarga, inyección en caliente y anexión de parcelas vecinas | ✅ |
| `src/world/buildings/BuildingLoader.ts` | Prefab → cajas: expansión RLE, culling de interiores y fusión codiciosa en X | ✅ |
| `src/environment/WeatherService.ts` | Clima real (Open-Meteo / OpenWeatherMap) normalizado a `WorldWeather`, con climatología de respaldo | ✅ |
| `src/environment/DayNightCycle.ts` | Sol de Esquel con `suncalc`, paleta de cielo por altura solar, orto y ocaso | ✅ |
| `src/environment/WeatherShaders.ts` | Domo celeste con nubes procedimentales, material de copo y de trazo | ✅ |
| `src/environment/ParticleEffects.ts` | Nieve, lluvia y ráfagas con buffers preasignados y *wrap* alrededor de la cámara | ✅ |
| `src/player/PlayerController.ts` | Movimiento, colisión eje por eje, cámara en tercera persona/isométrica con colisión | ✅ |
| `src/player/Avatar.ts` | Muñeco voxel con pechera de facción y ciclo de caminata | ✅ |
| `src/player/useKeyboard.ts` | Teclado, arrastre y rueda | ✅ |
| `src/scene/CityScene.tsx` | Donde se juntan motor, clima, sol y jugador; empuja al store a 4 Hz | ✅ |
| `src/state/gameStore.ts` | Store de zustand: jugador, clima, reloj, elección, diagnóstico | ✅ |
| `src/ui/PlayerHUD.tsx` + `widgets/` | HUD pixel-art: clima y hora, cuenta regresiva al comicio, stats, F3 | ✅ |
| `src/net/NetworkClient.ts` ✅ | Cliente Colyseus: canal AOI, padrón, chat, voz, reconciliación, dead reckoning |
| `src/net/session.ts` ✅ | Registro y login contra Hostinger; guarda el JWT |
| `src/entities/AvatarBuilder.ts` ✅ | Avatares voxel con color de facción y accesorios por rango (termo, bombo, megáfono, pancarta) |
| `src/entities/RemotePlayerManager.ts` ✅ | Spawn, despawn e interpolación de los vecinos; placas flotantes |
| `src/audio/SpatialVoiceManager.ts` ✅ | Micrófono, malla WebRTC, `PannerNode` 3D y detección de voz |
| `src/ui/ChatBubbles.tsx` · `VoiceHUD.tsx` · `OnboardingGate.tsx` ✅ | Burbujas, ondas de voz sobre la cabeza y onboarding de 30 s |
| `src/gameplay/` | Misiones, inventario, NPCs y comercios | 🔜 F3 |
| `src/political/` | Duelos de debate, mazos, movilizaciones | 🔜 F3 |
| `src/assets/` | Atlas de materiales y avatares | 🔜 F3 |
| `public/prefabs/` | Fachadas reales publicadas (las tres emblemáticas ya generadas) | ✅ |

## `/server-vps` — servidor autoritativo ✅ (Fase 2)

Node.js + Colyseus en un VPS Linux. Es la **única** autoridad sobre el estado del
mundo. Verifica el JWT con el secreto compartido; nunca consulta MySQL en el camino
caliente.

| Ruta | Responsabilidad | Estado |
|---|---|---|
| `src/index.ts` | Transporte WebSocket, CORS, `/health`, `/metrics` y el panel de Colyseus | ✅ |
| `src/config/env.ts` | Variables de entorno validadas: sin `JWT_SECRET` no arranca | ✅ |
| `src/auth/jwt.ts` | Verificación HS256 con `node:crypto`, gemela de `Jwt.php` | ✅ |
| `src/schema/PlayerState.ts` | Padrón replicado: identidad política, manzana, animación, voz, XP | ✅ |
| `src/schema/EsquelWorldState.ts` | Reloj de Esquel, clima, fase electoral, facciones, población | ✅ |
| `src/rooms/EsquelCityRoom.ts` | La sala: ciclo de vida, AOI a 10 Hz, chat en tres canales, militancia, anti-cheat, persistencia | ✅ |
| `src/systems/AoiIndex.ts` | Tabla hash por manzana: "quién está a menos de 4 cuadras" en O(1) | ✅ |
| `src/systems/MovementValidator.ts` | Velocidad, teletransporte, límites y altura. Corrige antes de expulsar | ✅ |
| `src/voice/VoiceSignaling.ts` | Malla WebRTC: quién habla con quién, ganancia, paneo e histéresis | ✅ |
| `src/services/HostingerBridge.ts` | Volcado de stats con deltas, firma HMAC, idempotencia y reintento | ✅ |
| `src/services/WeatherFeed.ts` | Clima autoritativo del shard (Open-Meteo + climatología) | ✅ |
| `scripts/smoke-test.ts` | Prueba de humo de punta a punta: dos clientes reales contra el servidor real | ✅ |
| `pm2.config.js` · `Dockerfile` | Despliegue en el VPS: reinicio automático, logs, healthcheck | ✅ |

## `/backend-php` — identidad, datos e inteligencia

PHP 8.x sobre Hostinger. Sirve la landing y el bundle, emite tokens, persiste y
calcula los agregados del motor de inteligencia.

| Ruta | Responsabilidad | Fase |
|---|---|---|
| `database/schema.sql` ✅ | Esquema completo: 30 tablas + 4 vistas, InnoDB, utf8mb4 |
| `database/seeds/` ✅ | Catálogos: facciones, rangos, ítems, cartas, misiones, zonas, comercios demo |
| `database/migrations/` ✅ | Convención y reglas de migración incremental |
| `api/auth/register.php` ✅ | Onboarding de 30 s: crea usuario, perfil demográfico y personaje, y devuelve el JWT |
| `api/auth/login.php` ✅ | Login con freno anti-fuerza bruta y rehash de contraseña |
| `api/sync/flush-stats.php` ✅ | Volcado del VPS: firma HMAC, deltas e idempotencia por lote |
| `src/{Config,Db,Http,Jwt,Validation}.php` ✅ | Autoload PSR-4 sin Composer, PDO, CORS, JWT HS256 y validación del onboarding |
| `public/` | `index.php` (landing + bundle) | 🔜 F3 |
| `src/Player/` | Perfiles, personajes, inventario, historial | 🔜 F1 |
| `src/Telemetry/` | Ingesta por lote, seudonimización HMAC, agregación nocturna con k-anonimato | 🔜 F4 |
| `src/Sponsors/` | Alta de comercios, marquesinas, reportes de rendimiento | 🔜 F4 |
| `src/Prefabs/` | Recepción de fotos, validación contra el JSON Schema, cola de revisión | 🔜 F3 |
| `src/Balance.php` | Réplica PHP de las fórmulas, con test de paridad contra `/shared` | 🔜 F2 |
| `tests/` | PHPUnit: auth, balance, k-anonimato | 🔜 F1+ |

## `/tools` — pipelines e integridad

| Ruta | Responsabilidad | Fase |
|---|---|---|
| `ci/check-balance.ts` ✅ | Verifica fórmulas ↔ tabla de rangos ↔ seed SQL, y las invariantes de diseño |
| `ci/validate-schemas.mjs` ✅ | Compila el JSON Schema con Ajv, valida ejemplos y la paridad con TypeScript |
| `ci/test-jwt-parity.ts` ✅ | Comprueba que PHP y Node firmen y verifiquen el mismo JWT, en las dos direcciones |
| `ci/gen-seeds.ts` ✅ | Genera los seeds derivados de `/shared/constants` (facciones, rangos, zonas) |
| `prefab-importer/VoxelVolume.ts` ✅ | API de autoría voxel: cajas, techos a dos aguas, bandas de ventanas, RLE |
| `prefab-importer/author-landmarks.ts` ✅ | Genera la Municipalidad, la Estación de La Trochita y el Comité Central |
| `prefab-importer/` (OSM) | Extracto de OpenStreetMap → parcelas → prefabs genéricos; fotos → prefab voxel | 🔜 F3 |
| `telemetry-cli/` | Ingesta de noticias locales, cálculo de agregados, exportes para el dashboard | 🔜 F4 |

## `/docs`

| Ruta | Contenido |
|---|---|
| `architecture/monorepo.md` ✅ | Este archivo |
| `architecture/deployment-dual.md` ✅ | Arquitectura Hostinger + VPS, superficie de API, flujos |
| `architecture/privacidad-telemetria.md` ✅ | Reglas del motor de inteligencia: seudonimato, k-anonimato, retención |
| `game-design/balance-formulas.md` ✅ | Modelos matemáticos y fórmulas |
| `game-design/politica-editorial.md` ✅ | Tono y espíritu del juego: hasta dónde llega la joda |
| `game-design/elecciones-2027.md` ✅ | Ciclo electoral, fases y multiplicadores del end-game |
| `prompts/PROMPT-1-handoff.md` ✅ | Plan de integración entregado al cierre del PROMPT 0 |
| `prompts/FASE-1-entrega.md` ✅ | Qué se construyó en la Fase 1, cómo se verificó y qué sigue |
| `media/` ✅ | Capturas del cliente corriendo |
| `ops/` | Runbooks de despliegue y guardia | 🔜 F5 |

---

## Convenciones transversales

**TypeScript.** `strict` completo más `exactOptionalPropertyTypes`,
`noImplicitOverride`, `noUnusedLocals` y `verbatimModuleSyntax`. Los campos
opcionales se **omiten**, no se mandan como `null`.

**Nombres.** Dominio en español rioplatense (`facciones`, `misiones_historial`,
`guita_centavos`), infraestructura en inglés (`PlayerState`, `WorldClock`). Los slugs
no llevan acentos ni eñes: `otonio`, `badenes`, `contracampania`.

**Base de datos.** `snake_case`, tablas en plural, FK `fk_<tabla>_<referencia>`,
índices `ix_<tabla>_<campo>`, únicos `uq_<tabla>_<campo>`, checks `ck_<tabla>_<regla>`.

**Git.** Ramas `feature/*`, `fix/*`, `chore/*`. Commits en imperativo. Ninguna
migración se edita después de haber sido aplicada en producción.

**Verificación local antes de abrir PR:**

```bash
npm run check:all      # typecheck (shared, tools, client, server) + balance + schemas + paridad JWT
npm run test:smoke     # prueba de humo del multijugador, con servidor y dos clientes reales
npm run build:client   # que el bundle compile de verdad
```
