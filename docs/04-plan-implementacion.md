# 04 — Plan de implementación modular

Responde el punto 4 del pedido. Ocho fases desacopladas, cada una con entregables, superficie de
cambio acotada, criterios de aceptación verificables y rollback. Diseñado para que un asistente de
código las ejecute de a una sin poner en riesgo ni Esquel Data ni Métrica.

> **⚠ PRIORIDAD REVISADA (2ª ronda).** El dato de precios es perecedero y el de ANAC no. El plan de
> abajo mantiene su estructura, pero el orden de arranque cambia: **F1a (colector mínimo) empieza en
> paralelo con F0**, apenas F0-1 y F0-3 den verde, y el catálogo semántico de `docs/06` va **antes**
> de construir vistas. Secuencia revisada en [`07-conectividad-sostenible.md`](07-conectividad-sostenible.md) §6.

---

## Reglas de oro (invariantes de no-regresión)

Estas reglas se violan una sola vez y el proyecto pierde la confianza que lo sostiene. **Cualquier
cambio que las contradiga debe rechazarse en revisión, sin excepción.**

| # | Invariante |
|---|---|
| **I1** | **Métrica no se modifica.** Nada de su código, contenedores, `docker-compose`, scheduler ni puerto 3013. La única interacción es `SELECT` con un rol de solo lectura |
| **I2** | **Las 24 tablas existentes son intocables**: mismos nombres, mismas columnas, mismos tipos. Las nuevas usan prefijos `air_`, `ota_`, `x_`, `ext_` |
| **I3** | **El ETL nunca aborta por un dataset nuevo.** `try/except` por tabla; una falla marca `disponible: false` en `meta.json` y el build continúa |
| **I4** | **El frontend nunca rompe por un dataset ausente.** Consultar `meta.json` antes de cargar; si no está, mostrar estado. Prohibida la pantalla en blanco |
| **I5** | **Sin contenedores ni puertos nuevos.** El subsistema aéreo es un timer de systemd más archivos |
| **I6** | **Sin descargas de navegador.** Playwright reutiliza el runtime instalado vía `PLAYWRIGHT_BROWSERS_PATH` |
| **I7** | **Cada componente nuevo es eliminable.** Borrar sus archivos y sus entradas de menú debe devolver el sistema al estado previo, sin migraciones inversas |
| **I8** | **Toda serie publicada declara su cobertura.** Bajo 80%, se marca preliminar. Sin dato, se dice; no se interpola |
| **I9** | **Ningún indicador crítico depende de la sonda Playwright.** Es enriquecimiento opcional |
| **I10** | **Cada fase entra en producción sola.** Nada queda a medias esperando la siguiente |

---

## Mapa de dependencias

```
F0 Spike de validación
 │
 ├──► F1 Colector aéreo (autónomo, sin tocar el tablero)
 │     │
 │     └──► F3 Tablas oro de aéreos ──┐
 │                                    │
 ├──► F2 Contrato de lectura Métrica ─┼──► F5 Modelos de cruce ──► F6 Monitor de alerta
 │     │                              │
 │     └──► F3 Tablas oro OTA ────────┤
 │                                    │
 └──► F2b Fuentes oficiales ANAC/EOH ─┘
                                      │
                                      └──► F4 Secciones del tablero ──► F7 Endurecimiento
```

F1, F2 y F2b son **paralelizables** y no se tocan entre sí. F4 puede empezar con datos sintéticos
apenas F3 fije los esquemas.

---

## F0 — Spike de validación (2–3 días)

**Objetivo:** decidir con evidencia, antes de escribir el sistema. Ninguna fase posterior arranca
sin esto.

| Entregable | Detalle |
|---|---|
| Ejecución de las 8 pruebas F0-1…F0-8 | [`specs/scripts/f0_validacion.py`](../specs/scripts/f0_validacion.py) |
| Informe de resultados | Una página con go/no-go por prueba |
| **Cálculo de $\sigma_{\text{aéreo}}$** | Prueba F0-8 — determina el encuadre del proyecto |

**Se crea:** solo el script y el informe. Cero cambios en sistemas existentes.

**Criterios de aceptación:**
- F0-1 respondida: se sabe si Google Flights lista Flybondi y JetSMART en rutas argentinas.
- F0-3: 30 consultas espaciadas sin bloqueo desde la IP del VPS.
- F0-4/F0-5: se conoce la estructura real de los CSV de ANAC y EOH (nombres de columna,
  IATA vs OACI, supresión de celdas de bajo volumen).
- F0-6: el contrato de lectura corre sobre Métrica con p95 medido.
- **F0-8 calculado y discutido con Leandro antes de seguir.**

**Bifurcaciones:**
- F0-1 negativo → agregar scraping semanal de `flybondi.com` solo `BUE-BRC`. **No** usar Amadeus.
- F0-3 con bloqueos → subir el espaciado a 60 s, recalcular el presupuesto de `docs/01` §4.3.
- F0-6 con p95 > 10 s → evaluar materialización **del lado de Esquel Data**, nunca dentro de Métrica.

**Rollback:** borrar el script.

---

## F1 — Colector aéreo autónomo (4–6 días)

**Objetivo:** capturar y persistir precios. Sin ninguna conexión con el tablero.

**Se crea:**
```
/opt/metrica-aereos/
├── aereos/{tfs.py, collect.py, parse.py, schedule.py, budget.py, store.py, runs.py}
├── tests/fixtures/*.html.gz
├── bin/preflight.sh
└── venv/
/etc/metrica-aereos/rutas.json          ← specs/config/rutas_muestreo.json
/etc/systemd/system/metrica-aereos.{service,timer}
/var/lib/metrica-aereos/{bronze,silver,runs}/
```

**No se toca:** absolutamente nada preexistente.

| Componente | Requisito |
|---|---|
| `tfs.py` | Codificador protobuf **vendorizado**, no dependencia externa (H5) |
| `parse.py` | Parser propio con fixtures y tests de contrato; canario de rendimiento de parseo |
| `schedule.py` | Matriz de cadencia de `docs/01` §4.2, orden aleatorizado con pesos |
| `budget.py` | Tope 250/día, contador de SerpApi persistente, circuit breaker |
| `runs.py` | Bitácora completa: `ok`, `sin_resultados`, `bloqueado`, `timeout`, `parse_error`, `omitido_por_presupuesto` |
| `preflight.sh` | Guardia de memoria y de procesos Chromium (H13-b) |

**Criterios de aceptación:**
1. Siete noches consecutivas con cobertura ≥90% de lo planificado.
2. RSS máximo del proceso < 200 MB (medido con `systemd-cgtop`).
3. Duración de corrida < 120 min.
4. `air_scrape_runs` registra **todas** las consultas planificadas, incluidas las fallidas.
5. Ninguna corrida solapa con la ventana de Métrica; sin degradación medible del VPS.
6. Tests de contrato del parser en verde sobre las fixtures.
7. Reprocesar bronce → plata reproduce plata bit a bit.

**Rollback:** `systemctl disable --now metrica-aereos.timer`; borrar `/opt/metrica-aereos`. Los datos
en `/var/lib` quedan; no molestan a nadie.

**Riesgo principal:** F0-1 negativo. Mitigación en la bifurcación de F0.

---

## F2 — Contrato de lectura con Métrica (2–3 días)

**Objetivo:** extraer agregados de Métrica sin tocarla.

**Se crea:** `etl/contracts/metrica/{ota_daily.sql, ota_leadtime.sql}`, `etl/sources_metrica.py`,
rol `esquel_ro` en PostgreSQL.

**No se toca:** ni una línea de código de Métrica. Ninguna tabla, vista, índice o función dentro de
su esquema.

**Criterios de aceptación:**
1. `esquel_ro` **no puede escribir**: verificado con un `INSERT` de prueba que debe fallar.
2. p95 de la extracción completa < 10 s en 30 corridas.
3. Con Métrica detenida, el ETL continúa y marca el dataset como desactualizado (**no aborta** — I3).
4. `pg_stat_activity` muestra `application_name='esquel_data_etl'` durante la extracción.
5. Los agregados cuadran contra un conteo manual sobre las tablas base.

**Rollback:** `DROP ROLE esquel_ro`; borrar los archivos del contrato.

---

## F2b — Fuentes oficiales ANAC + EOH (2–3 días) · *paralelizable con F1 y F2*

**Objetivo:** ingerir la Capa 0. Ver [`05-fuentes-oficiales.md`](05-fuentes-oficiales.md).

**Se crea:** `etl/sources_oficiales.py`, `etl/normalize_anac.py`, `etl/normalize_eoh.py`,
`bronze/oficial/`.

**Criterios de aceptación:**
1. Descarga vía CKAN `package_show` (sin URLs de archivo hardcodeadas).
2. Serie de EQS, BRC, CPC, PMY, REL, CRD, USH, FTE con pax, butacas y LF, desde 2017.
3. Serie EOH con desagregación patagónica.
4. Validación de esquema: ante cambio de estructura, conserva el último dato bueno y marca en
   `meta.json`; nunca aborta.
5. **$\sigma_{\text{aéreo}}$ recalculada con butacas reales de ANAC**, contrastada con la estimación
   de F0-8.

**Rollback:** borrar los módulos; las tablas `air_fact_capacidad_mes` y `ext_fact_eoh_mes` quedan
`disponible: false` y las secciones que las usan lo informan.

---

## F3 — Tablas oro y emisión Arrow (3–4 días)

**Objetivo:** que el ETL emita las tablas nuevas junto a las 24 existentes, sin alterarlas.

**Se toca (aditivo, con aislamiento de fallos):**
```
etl/build.py        + bloques try/except por dataset nuevo   ← ÚNICO cambio en archivo existente
etl/emit.py         + validación de esquema y orden físico de las tablas nuevas
etl/gold_aereos.py     nuevo
etl/gold_ota.py        nuevo
oit_api/main.py     ninguno — /api/datos/{tabla}.arrow ya es genérico
```

**Criterios de aceptación:**
1. **Las 24 tablas existentes salen byte-idénticas** a las de antes del cambio. Verificado con
   `sha256sum` sobre una corrida previa y posterior. *Este es el criterio más importante de la fase.*
2. Cada tabla nueva respeta su presupuesto de bytes (`docs/03` §5).
3. Emisión ordenada físicamente por `(destino, fecha)`.
4. `meta.json` incluye disponibilidad, cobertura y `schema_version` por dataset.
5. Simulando la falla de cada fuente nueva, el ETL termina en verde y emite las 24 tablas.
6. Los `.arrow` nuevos cargan en DuckDB-WASM con los tipos esperados.

**Rollback:** revertir el bloque aditivo de `build.py`; borrar los módulos `gold_*`.

---

## F4 — Secciones del tablero (5–7 días)

**Objetivo:** las tres secciones del informe original (§6), con lazy loading.

**Se crea:** `web/src/secciones/aereos/`, `web/src/secciones/mercado/`,
`web/src/secciones/integrada/`, más las consultas de
[`specs/sql/03_duckdb_wasm_patterns.sql`](../specs/sql/03_duckdb_wasm_patterns.sql).

**Se toca:** `web/src/App.tsx` — **solo** para agregar tres entradas de menú y sus rutas
perezosas. Ningún componente, token de diseño ni vista preexistente se modifica.

| Sección | Contenido |
|---|---|
| ✈ **Aéreos y Conectividad** | Tarifario comparativo patagónico · Semáforo de frecuencias y butacas (ANAC) · Curva de evolución tarifaria · **Índice de Fuga de Puerta de Entrada** |
| 🏠 **Mercado OTA / Métrica** | Benchmark regional · ADR por tipología · Curva de anticipación con **punto de congelamiento $\ell_{90}$** |
| ⚡ **Inteligencia Integrada** | Gráfico maestro tripartito · Calculadora TTCI (con $N^{\*}$ e IC) · Descomposición del desvío · Panel de alerta temprana |

**Criterios de aceptación:**
1. Todas las vistas preexistentes se comportan exactamente igual (revisión visual + pruebas
   existentes en verde).
2. Carga inicial ≤ 3 MB transferidos; las tablas de aéreos no se descargan hasta abrir la sección.
3. Interacción de cross-filter < 100 ms de p95 con el dataset completo.
4. Con `meta.json` marcando un dataset no disponible, la sección muestra su estado y el resto del
   tablero funciona con normalidad.
5. Se respetan `tokens.css` y las pautas de estilo: tablas compactas, alto contraste, insignias
   translúcidas, panel lateral intacto.
6. Toda serie con cobertura <80% aparece marcada como preliminar (I8).

**Rollback:** quitar las tres entradas de `App.tsx` y borrar los directorios de sección.

---

## F5 — Modelos analíticos de cruce (4–5 días)

**Objetivo:** implementar `docs/02` §2–§7 en el ETL.

**Se crea:** `etl/modelos/{ttci.py, paridad.py, capacidad.py, elasticidad.py, descomposicion.py}`.

**Criterios de aceptación:**
1. Componentes de TTCI emitidos por puerta de entrada; el TTCI final se calcula en el navegador.
2. $N^{\*}$, IC e IFPE calculados y presentes en `x_fact_correlacion_dia`.
3. Modelo hedónico con ≥15 rutas; se reportan $R^2$, número de rutas e IC bootstrap. Con menos
   rutas, solo se emite el ratio descriptivo, etiquetado como tal.
4. Descomposición con **residuo explícito** y gates de suficiencia activos (§7). Con datos
   deliberadamente insuficientes, emite "evidencia insuficiente".
5. Elasticidad como **banda** hasta cumplir 24 meses × 6 destinos.
6. Tests unitarios con casos sintéticos de resultado conocido para cada fórmula.

**Rollback:** borrar `etl/modelos/`; `x_*` queda no disponible y la sección Integrada lo informa.

---

## F6 — Monitor de alerta temprana (3–4 días)

**Objetivo:** implementar `docs/02` §8.

**Se crea:** `etl/modelos/alerta.py`, `web/src/secciones/integrada/PanelAlerta.tsx`.

**Criterios de aceptación:**
1. Las cuatro señales, el índice compuesto y las bandas, según §8.2–8.3.
2. Histéresis funcionando: **verificada con datos sintéticos oscilantes** que no deben producir
   alertas intermitentes.
3. Compuerta de cobertura: con <80%, el estado es "sin señal", **nunca verde**.
4. Ventana de accionabilidad respetada ($21 \le \ell \le 75$).
5. Prescripción diferenciada según señal dominante: "agotado" y "caro" producen recomendaciones
   distintas.
6. Volumen en riesgo y presupuesto reasignable calculados con $\sigma_{\text{aéreo}}$ real.
7. Backtest sobre el histórico disponible: ninguna alerta roja en semanas que resultaron normales.

**Rollback:** borrar el módulo y el panel.

---

## F7 — Endurecimiento y documentación (3–4 días)

| Entregable | Detalle |
|---|---|
| Backfill de fuentes oficiales | ANAC desde 2017, EOH desde 2015 |
| Monitoreo del colector | Alerta ante 2 corridas fallidas seguidas o canario de parseo en rojo |
| Nota metodológica pública | Fuentes, cobertura, limitaciones y qué **no** puede afirmar el sistema |
| Runbook | Qué hacer si Google Flights cambia el markup, si ANAC deja de publicar, si Métrica se detiene |
| Rotación de bronce-HTML | 14 días + fixtures permanentes |
| Revisión de presupuestos | Bytes, RAM y consultas medidos, no estimados |

La nota metodológica no es burocracia: es lo que permite que un tercero —una cámara empresaria, un
periodista, un funcionario de ANAC— acepte los números. Un observatorio sin metodología publicada es
una opinión con gráficos.

---

## Resumen de esfuerzo

| Fase | Días | Paralelizable con | Bloquea a |
|---|---|---|---|
| F0 | 2–3 | — | todas |
| F1 | 4–6 | F2, F2b | F3 |
| F2 | 2–3 | F1, F2b | F3 |
| F2b | 2–3 | F1, F2 | F5 |
| F3 | 3–4 | — | F4, F5 |
| F4 | 5–7 | F5 | — |
| F5 | 4–5 | F4 | F6 |
| F6 | 3–4 | — | — |
| F7 | 3–4 | — | — |

**Ruta crítica:** F0 → F1 → F3 → F5 → F6 ≈ **17–22 días** de trabajo efectivo.
Con F2/F2b en paralelo, el total no cambia. Primer valor entregable al usuario: **fin de F4**, con
las secciones funcionando aun sin los modelos de cruce.

---

## Orden de trabajo sugerido para el asistente de código

1. **F0 completo, y detenerse.** Revisar resultados con Leandro. F0-8 puede reordenar prioridades.
2. F1 y F2 en paralelo. F1 debe correr siete noches antes de seguir.
3. F2b mientras F1 acumula noches.
4. F3 — con verificación byte a byte de las 24 tablas existentes (criterio 1).
5. F4 con datos reales. **Entregar y mostrar acá**: es el primer valor visible.
6. F5, luego F6.
7. F7 antes de cualquier publicación externa de los números.

Nunca avanzar a la fase siguiente con criterios de aceptación pendientes. El costo de arrastrar una
falla de F1 hasta F6 es de un orden de magnitud mayor que el de detenerse a corregirla.
