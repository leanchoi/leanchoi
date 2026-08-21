# Plan de integración y traspaso al PROMPT 1

> **De:** Claude (arquitectura y generación de código)
> **Para:** Antigravity (ejecución, auditoría y redacción del PROMPT 1)
> **Estado:** cierre del PROMPT 0 · versión 1.0.0

---

## 1. Qué quedó entregado y verificado

| # | Entregable | Ruta | Verificación |
|---|---|---|---|
| 1 | Estructura del monorepo | [`docs/architecture/monorepo.md`](../architecture/monorepo.md) | Árbol creado, responsabilidades por directorio |
| 2 | Esquema MySQL | [`backend-php/database/schema.sql`](../../backend-php/database/schema.sql) | 30 tablas + 4 vistas; parseado como MySQL |
| 3 | Contratos TypeScript | [`shared/types/`](../../shared/types) | `tsc --noEmit` en verde con `strict` completo |
| 4 | JSON Schema de fachadas | [`shared/schemas/building-prefab.schema.json`](../../shared/schemas/building-prefab.schema.json) | Compila con Ajv 2020-12; 2 ejemplos válidos; paridad con TS |
| 5 | Fórmulas de balance | [`docs/game-design/balance-formulas.md`](../game-design/balance-formulas.md) | `check:balance` verifica 7 invariantes |
| 6 | Plan de integración | este documento | — |

Extras que no estaban pedidos pero que el resto de las fases necesita para no
improvisar: protocolo de red tipado (`shared/protocol/`), implementación ejecutable
de las fórmulas (`shared/util/`), seeds de catálogo (facciones, rangos, ítems, 24
cartas, 10 misiones, zonas, comercios de demo), tres verificadores de CI y las
políticas de privacidad y editorial que condicionan el contenido de las fases 3 y 4.

**Salida de las verificaciones al cierre:**

```
$ npm run typecheck        → sin errores (shared/ y tools/)
$ npm run check:balance    → 120.8 h a rango 10 · 273/115/10 XP · daño máx. 46 · 10.97 vs 7.06
$ npm run validate:schemas → schema compilado · 2 ejemplos válidos · 20 propiedades en paridad
```

## 2. Cómo se ensambla en las fases siguientes

```
FASE 0  Contratos ─────────────────────────────────────────────►  (acá estamos)
        · /shared es la referencia de las cuatro fases restantes

FASE 1  Vertical slice jugable
        · client/src/core + world + render: cuadrícula de Esquel, avatar, cámara
        · server-vps: CityRoom con WorldState real y bucle a 20 Hz
        · backend-php: auth EdDSA, /me, /characters, JWKS
        · HUD con hora y clima reales de Esquel
        ✔ Criterio: dos jugadores se ven moverse por Av. Alvear con el mismo
          reloj, el mismo clima y reconciliación de movimiento andando

FASE 2  Bucle de militancia
        · Misiones (10 tipologías) con el orquestador Live-Ops
        · Inventario, progresión, ascensos, estipendios
        · Duelos de debate completos con las 24 cartas
        · Balance.php + test de paridad con /shared/util/balance.ts
        ✔ Criterio: un jugador llega a rango 3 jugando, sin intervención manual

FASE 3  Social y ciudad real
        · Chat con burbujas + voz espacial WebRTC (malla, atenuación y paneo)
        · prefab-importer: OSM → parcelas → prefabs genéricos
        · Contribuciones de fachadas con revisión humana
        ✔ Criterio: una fachada real cargada por un vecino reemplaza al genérico
          sin mover la cuadrícula ni romper colisiones

FASE 4  Inteligencia y auspicios
        · Ingesta de telemetría, seudonimato, agregación con k-anonimato
        · Ingesta de noticias reales → misiones emergentes
        · Panel de comercios y reportes de rendimiento
        ✔ Criterio: un corte de intención de voto por barrio, publicable y con
          margen de error, generado sólo con datos consentidos

FASE 5  Operación y lanzamiento
        · Sharding, PM2/systemd, observabilidad, runbooks
        · Moderación en vivo, herramientas de Live-Ops
        ✔ Criterio: 3 shards concurrentes sostenidos 24 h sin pérdida de progreso
```

## 3. Checklist de auditoría para Antigravity

**Base de datos**
- [ ] `mysql < backend-php/database/schema.sql` sobre una base vacía, sin warnings.
- [ ] Aplicar los 7 seeds en orden numérico.
- [ ] Confirmar que la versión del motor (MySQL 8 vs MariaDB) acepta las columnas
      generadas `parcela_activa`, `slot_equipado`, `franja_etaria` y `dia`.
- [ ] Verificar que `002_rangos.sql` cargó los 10 rangos con `xp_total` 0…332450.
- [ ] Probar la unicidad parcial: dos prefabs activos en la misma parcela deben fallar.
- [ ] Medir el plan de `v_balance_misiones` con 100k filas simuladas y ajustar índices
      si hace falta.

**Código compartido**
- [ ] `npm install` y `npm run check:all` en verde.
- [ ] Confirmar que la versión de Node del VPS soporta `--experimental-strip-types`
      (≥ 22.6) o dejar `tsx` como alternativa en los scripts.
- [ ] Revisar que ningún archivo de `/shared` importe algo de `/client` o `/server-vps`.

**Georreferenciación** (la deuda técnica conocida más importante)
- [ ] Bajar un extracto OSM de Esquel y **calibrar** `WORLD_ANCHOR.gridBearingDeg`
      (hoy 39°, aproximado), `blockSizeM` y `streetWidthM` con las calles reales.
- [ ] Ajustar los rangos de celdas por barrio en `BARRIO_DEFS` con los límites
      barriales reales.
- [ ] Revisar la celda asignada a cada POI de `POIS`.

**Seguridad y privacidad**
- [ ] Generar el par Ed25519 y definir la rotación de `kid`.
- [ ] Definir dónde vive la sal del HMAC de seudonimato y su rotación a 30 días.
- [ ] Confirmar que el hosting permite cron para retención y agregación nocturna.

## 4. Decisiones que necesito confirmadas en el PROMPT 1

| # | Decisión | Opciones | Por qué bloquea |
|---|---|---|---|
| 1 | Motor de base en Hostinger | MySQL 8 / MariaDB 10.6 / 11.x | Define si el particionado de telemetría es viable ahí o queda en el VPS |
| 2 | Stack PHP | Vanilla + PSR-4 / Slim / Laravel | Cambia la forma de todo el código de la Fase 1 |
| 3 | Proveedor de clima | Open-Meteo (sin clave) / OpenWeather / SMN | Define el mapeo a `WeatherCondition` y el manejo de cuota |
| 4 | Fuentes de noticias | RSS municipal, diarios locales, scraping | Define el ingestor y el filtro editorial de la Fase 4 |
| 5 | Specs del VPS | vCPU, RAM, región | Fija cuántos shards por proceso y el presupuesto de AOI |
| 6 | Dominio y TLS | dominio definitivo, subdominio `rt.` para WSS | Va en `iss`/`aud` del JWT y en el CORS |
| 7 | Objetivo de dispositivo | ¿mobile de gama media en el alcance de F1? | Define el presupuesto de draw calls y si hay LOD agresivo desde el inicio |
| 8 | Alcance del Modo Candidato | ¿F2 o después de F5? | Hoy está contemplado en los tipos pero no tiene fases asignadas |

Cualquier respuesta sirve; lo que no sirve es que queden implícitas. Si alguna no
está decidida, decilo explícitamente y avanzo con la opción por defecto que marqué en
negrita al describir cada módulo.

## 5. Qué espero recibir en el PROMPT 1

1. **Informe de auditoría** del PROMPT 0: qué corrió, qué falló, qué corregiste y qué
   diferencias encontraste entre lo entregado y lo que el entorno real acepta. Con
   los mensajes de error textuales, no un resumen.
2. **Las 8 decisiones** de la sección 4, resueltas o marcadas como pendientes.
3. **Alcance exacto de la Fase 1** y su criterio de aceptación, en la forma
   «un jugador puede X y se verifica con Y».
4. **Restricciones reales del entorno**: versión de PHP y extensiones disponibles,
   límites de memoria y de ejecución, si hay cron, si hay Redis, ancho de banda del
   VPS, límite de inodos del hosting.
5. **Correcciones al esquema o a los contratos** que hayas necesitado aplicar, para
   que las incorpore como fuente de verdad en vez de regenerar algo divergente.

Con eso entrego, en el PROMPT 1: las salas de Colyseus con el estado tipado, el
generador procedimental de la cuadrícula, el cliente 3D con HUD conectado al reloj y
clima reales, y los endpoints de autenticación completos, todo con rutas explícitas y
listo para que lo audites igual que este.
