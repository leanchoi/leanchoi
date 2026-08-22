# Fase 1 — Motor 3D voxel, mapa de Esquel, clima real y pipeline de fachadas

> **Estado:** entregado · verificado corriendo en navegador
> Rama: `claude/esquel-2027-architecture-6aegk3`

## 1. Qué se construyó

| Bloque | Archivos | Qué hace |
|---|---|---|
| **Motor voxel** | `client/src/engine/{VoxelTypes,VoxelPalette,ChunkManager,VoxelWorld,Vegetation,MountainBackdrop}.ts` | Una manzana = un chunk = **dos draw calls** (opaco + vidrio) vía `InstancedMesh`. Construcción incremental con presupuesto por cuadro, LOD por distancia, descarga de lo lejano y colisionadores para el jugador |
| **Traza urbana** | `client/src/world/{EsquelStreetGrid,ProceduralBuildings}.ts` | 16 arterias reales sobre la grilla, 20 parcelas por manzana, resolución de direcciones al estilo argentino y generación procedimental determinista por `parcelId` |
| **Fachadas reales** | `client/src/world/buildings/{PrefabRegistry,BuildingLoader}.ts` + `tools/prefab-importer/` | Índice → descarga → reemplazo del genérico, con anexión de parcelas vecinas para los hitos. Tres edificios emblemáticos ya generados |
| **Clima y sol** | `client/src/environment/{WeatherService,DayNightCycle,WeatherShaders,ParticleEffects}.ts` | Clima real de Esquel con respaldo climatológico, sol con `suncalc`, domo celeste con nubes procedimentales, nieve/lluvia/ráfagas |
| **HUD** | `client/src/ui/` | Clima + hora reales, **cuenta regresiva a los comicios 2027** con badge de fase, stats del militante y panel de diagnóstico (F3) |
| **Ciclo electoral** | `shared/{types,constants,util}/election.ts` | Cinco fases con sus multiplicadores, calendario configurable y cuenta regresiva. `WorldState.election` ya lo transporta |

### Los tres edificios emblemáticos

| Edificio | Dirección | Volumen | Peso |
|---|---|---|---|
| Municipalidad de Esquel | San Martín 650 | 108 × 34 × 40 vox (54 × 17 × 20 m) | 37 KB |
| Estación La Trochita | Roggero y Brun | 148 × 26 × 40 vox (74 × 13 × 20 m) | 22 KB |
| Comité Central | Av. Alvear 1200, frente a la plaza | 54 × 24 × 40 vox (27 × 12 × 20 m) | 10 KB |

Se generan con `npm run prefabs`, validan contra el JSON Schema del PROMPT 0 y se
sirven desde `client/public/prefabs/`. El de la Municipalidad ocupa cuatro lotes de
la cara este: los vecinos dejan de generar su edificio genérico automáticamente.

## 2. Cómo se verificó

```
npm run typecheck        → shared + tools + client, strict completo, 0 errores
npm run check:balance    → 7 invariantes de diseño en verde
npm run validate:schemas → schema + 2 ejemplos + 3 fachadas reales + paridad de calles
npm run build:client     → 1.04 MB de JS (296 KB gzip) en 8 s
```

Y, sobre todo, **corriendo**: se levantó el bundle en Chromium headless y se
recorrió la ciudad. Capturas en [`docs/media/`](../media).

| Verificación en navegador | Resultado |
|---|---|
| Carga y render sin errores de página | ✅ (sólo fallan las llamadas al clima, sin salida a internet en el sandbox) |
| Descarga de las 3 fachadas | ✅ `200 index.json`, `200 estacion-la-trochita`, `200 municipalidad-esquel`, `200 comite-central` |
| HUD con clima, hora y contador | ✅ `1°C · 13:00`, `295d 06:16:09`, `Precampaña` |
| Resolución de dirección desde la posición | ✅ el HUD dice `San Martín al 600`, `Roggero al 900`, `Plaza San Martín` |
| Nieve, ciclo día/noche, vidrieras encendidas | ✅ verificado a las 12:00, 17:00, 19:30 y 23:00 |
| Ciudad construida alrededor del jugador | ✅ 77 chunks, ~16.600 instancias, 1.982 colisionadores |

**Sobre los FPS:** las mediciones del sandbox (10-13 FPS) son con SwiftShader, un
renderizador por software. No dicen nada del rendimiento real; lo que sí es medible
es el trabajo por cuadro: **2 draw calls por manzana** y ~16.600 instancias para 77
manzanas. El presupuesto de 60 FPS se valida con GPU real en la Fase 2.

## 3. Decisiones tomadas en el camino

1. **React Three Fiber, con el motor afuera de React.** Los componentes montan
   clases (`VoxelWorld`, `ChunkManager`, `PlayerController`) y el bucle escribe al
   store a 4 Hz. React no re-renderiza por cuadro.
2. **Cajas fusionadas, no voxels sueltos.** El `VoxelBox` es un prisma ya fusionado.
   Un edificio de 25.000 voxels entra en ~400 cajas gracias al culling de interiores
   y la fusión codiciosa en X.
3. **Sin tone mapping y sin sombras.** Los colores planos se ven mejor directos, y
   las sombras dinámicas sobre instancing no valen su costo todavía.
4. **Luces en unidades físicas.** Desde three r155 una direccional de intensidad 1
   deja la escena casi negra: el rango útil quedó en 0,18 (noche) a 3,0 (mediodía),
   con transición suave de crepúsculo.
5. **Colisión de cámara.** La cámara se acerca sola cuando un álamo o una pared se
   mete entre ella y el jugador.
6. **La regla de procedencia del schema se acotó** a las contribuciones de la
   comunidad: un hito autorado por el proyecto no necesita fotos de vecinos. Un
   prefab activo, en cambio, sigue exigiendo revisión aprobada.

## 4. Deuda técnica conocida

| Tema | Estado | Cuándo |
|---|---|---|
| Calibración de la traza contra OpenStreetMap | La topología es correcta (qué calle cruza con cuál) y las distancias son reales; el rumbo de la grilla sigue siendo el aproximado del PROMPT 0 | F2, con `prefab-importer` |
| Terreno plano | El valle es plano; los cerros dan el relieve | F3 |
| Interiores | Ningún prefab tiene interior navegable | F3 |
| Sombras y oclusión ambiental | Desactivadas | F3, medido en GPU real |
| Presupuesto móvil | Falta bajar partículas y distancia de render por dispositivo | F2 |

## 5. Qué necesita el próximo bloque

1. **GPU real**: correr `npm run dev` en una máquina con placa y confirmar 60 FPS a
   `distanceCells=6`. Si no da, el primer ajuste es `buildBudget` y el segundo,
   `detailCells`.
2. **Colyseus**: `client/src/net/` y las salas del VPS, para que `PlayerController`
   pase de autoridad local a predicción con reconciliación.
3. **Extracto de OSM de Esquel** para calibrar la grilla y generar los prefabs
   genéricos por parcela real.
4. **Fecha oficial del comicio**, si ya salió la convocatoria: se cambia
   `ELECTION_DAY_ISO` y se reacomoda todo solo.
