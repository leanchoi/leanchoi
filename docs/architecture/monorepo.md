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

## `/client` — cliente 3D voxel

Three.js + Vite. Compila a estático y se sube a Hostinger. **No decide nada**: predice
movimiento, interpola estado y muestra.

| Ruta | Responsabilidad | Fase |
|---|---|---|
| `src/core/` | Bootstrap, bucle de juego, input, cámara, reconciliación con el servidor | 🔜 F1 |
| `src/world/` | Cuadrícula de Esquel, chunks, terreno, carga de prefabs por LOD y AOI | 🔜 F1 |
| `src/render/` | Materiales voxel, instancing, sombras, cielo dirigido por `WorldClock`, partículas de nieve/lluvia | 🔜 F1 |
| `src/net/` | Cliente Colyseus, buffer de interpolación, envío de intents, reintentos | 🔜 F1 |
| `src/audio/` | Malla WebRTC de voz por proximidad, `PannerNode` + `GainNode` según `S2CVoicePeers` | 🔜 F3 |
| `src/ui/` | HUD (hora y clima reales, salud, guita, reputación, XP, facción), burbujas de chat, minimapa | 🔜 F1 |
| `src/gameplay/` | Misiones, inventario, interacción con NPCs y comercios | 🔜 F2 |
| `src/political/` | Tablero de duelos de debate, mazos, movilizaciones, panel de facción | 🔜 F2 |
| `src/assets/` | Atlas de materiales y de avatares, catálogo de iconos | 🔜 F1 |

## `/server-vps` — servidor autoritativo

Node.js + Colyseus en un VPS Linux. Es la **única** autoridad sobre el estado del
mundo. Verifica el JWT con la clave pública de Hostinger; nunca consulta MySQL en el
camino caliente.

| Ruta | Responsabilidad | Fase |
|---|---|---|
| `src/rooms/` | `CityRoom` (shard de ciudad), `DebateRoom`, `LobbyRoom` | 🔜 F1 |
| `src/state/` | Esquemas `@colyseus/schema` que materializan `WorldState` / `PlayerState` | 🔜 F1 |
| `src/systems/` | Movimiento y anti-cheat, misiones Live-Ops, territorio, NPCs, buffs, clima | 🔜 F1-F2 |
| `src/net/` | Handshake, rate limiting de intents, relay de señalización WebRTC, AOI | 🔜 F1/F3 |
| `src/services/` | Cliente de la API PHP (persistencia diferida), Redis, proveedor de clima, ingestor de noticias | 🔜 F1-F4 |
| `src/config/` | Variables de entorno tipadas, límites del shard, claves públicas JWKS | 🔜 F1 |
| `scripts/` | Arranque con PM2/systemd, sondas de salud, migración de shards | 🔜 F5 |

## `/backend-php` — identidad, datos e inteligencia

PHP 8.x sobre Hostinger. Sirve la landing y el bundle, emite tokens, persiste y
calcula los agregados del motor de inteligencia.

| Ruta | Responsabilidad | Fase |
|---|---|---|
| `database/schema.sql` ✅ | Esquema completo: 30 tablas + 4 vistas, InnoDB, utf8mb4 |
| `database/seeds/` ✅ | Catálogos: facciones, rangos, ítems, cartas, misiones, zonas, comercios demo |
| `database/migrations/` ✅ | Convención y reglas de migración incremental |
| `public/` | `index.php` (landing + bundle), `api.php` (front controller REST) | 🔜 F1 |
| `src/Auth/` | Registro, login, JWT EdDSA, rotación de refresh tokens, JWKS | 🔜 F1 |
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
| `ci/gen-seeds.ts` ✅ | Genera los seeds derivados de `/shared/constants` (facciones, rangos, zonas) |
| `prefab-importer/` | OSM → parcelas → prefabs genéricos; fotos → prefab voxel + revisión | 🔜 F3 |
| `telemetry-cli/` | Ingesta de noticias locales, cálculo de agregados, exportes para el dashboard | 🔜 F4 |

## `/docs`

| Ruta | Contenido |
|---|---|
| `architecture/monorepo.md` ✅ | Este archivo |
| `architecture/deployment-dual.md` ✅ | Arquitectura Hostinger + VPS, superficie de API, flujos |
| `architecture/privacidad-telemetria.md` ✅ | Reglas del motor de inteligencia: seudonimato, k-anonimato, retención |
| `game-design/balance-formulas.md` ✅ | Modelos matemáticos y fórmulas |
| `game-design/politica-editorial.md` ✅ | Límites de la sátira política y proceso de moderación |
| `prompts/PROMPT-1-handoff.md` ✅ | Plan de integración y qué se espera del PROMPT 1 |
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
npm run check:all     # typecheck + check:balance + validate:schemas
```
