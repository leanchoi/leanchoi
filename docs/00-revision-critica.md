# 00 — Revisión crítica del informe original

Hallazgos ordenados por impacto sobre el diseño. Cada uno indica **qué dice el informe**, **qué
problema tiene** y **qué hacer**. Los marcados 🔴 invalidan una decisión de diseño y deben
resolverse antes de escribir código; los 🟠 requieren corrección pero no bloquean; los 🟡 son
mejoras de robustez.

---

## 🔴 H1 — Esquel es una ruta monopólica con capacidad estructuralmente mínima

**El informe** trata a EQS como un destino más del cluster patagónico y plantea monitorear
`COR → EQS` en paralelo a `BUE → EQS`, con una tesis centrada en el **precio** del pasaje.

**El problema.** La conectividad verificable de Esquel es:

| Hecho | Valor | Estado |
|---|---|---|
| Aerolíneas que operan EQS | 1 (Aerolíneas Argentinas) | Verificado en fuentes de horarios |
| Orígenes con vuelo directo | 1 (Buenos Aires / AEP) | Verificado |
| Frecuencias semanales, base | **6** (diario salvo martes) | Corregido — ver nota abajo |
| Frecuencias, ago–sep (+ COR–EQS) | **7** | Confirmado en prensa y por el acuerdo |
| Frecuencias, Tulipanes | **hasta 9** (2 diarias) | Aportado por el OIT |
| Equipo habitual | Embraer E190 (≈96 plazas) | **No asumir** — ANAC publica `butacas` reales |
| Butacas mensuales, base → pico | **≈2.494 → ≈3.741** | Derivado, confirmar con ANAC |
| Distancia AEP–EQS | ≈1.439 km | Calculado sobre coordenadas semilla |
| Distancia AEP–BRC | ≈1.335 km (Esquel: +7,8%) | Calculado sobre coordenadas semilla |

> **⚠ CORRECCIÓN (2ª revisión).** La versión anterior de esta tabla consignaba ≈3 frecuencias
> semanales, tomadas de un agregador de horarios. **El valor real es aproximadamente el doble** y
> además es estacional. Eso duplica σ_aéreo y **cambia el signo de la conclusión estratégica**: el
> canal aéreo no es marginal, y en meses de pico es un canal de volumen. Detalle en
> [`07-conectividad-sostenible.md`](07-conectividad-sostenible.md) §1.
>
> Lección para el diseño: para la misma ruta y mes se encontraron cifras de 3, 4, 6 y 27
> frecuencias semanales según el agregador. **Los agregadores de horarios no son fuente.** La
> frecuencia se toma de ANAC (operado real) o del scraping (programado), y el catálogo admite
> corrección manual verificada por el equipo del OIT, con `verificado_por` y `fecha_verificacion`.

Tres consecuencias que reordenan el proyecto:

1. **No existe COR–EQS directo.** Toda consulta Córdoba–Esquel devolverá itinerarios con conexión
   (típicamente vía AEP). Hay que modelar `stops_count` y tiempo total de viaje, y el TTCI desde
   Córdoba debe incorporar el costo del tiempo, no solo el del pasaje.
2. **La brecha EQS/BRC no es un precio, es una estructura.** Bariloche tiene tres operadores
   compitiendo (AR, Flybondi, JetSMART) y decenas de frecuencias; Esquel tiene un oferente y tres
   vuelos. Atribuir la diferencia a una política tarifaria de Aerolíneas es un error de
   interpretación que además debilita el argumento ante ANAC: lo que hay que medir y mostrar es
   **cuánto del gap explica la falta de competencia** (ver §2.4 de `docs/02`).
3. **Existe un techo de demanda aérea, y es estacional.** Aun con vuelos llenos y tarifa cero, el
   canal aéreo no puede aportar más de `butacas_mes × LF_máximo × estadía_media` pernoctes. Con
   las frecuencias corregidas ese techo es material —no marginal— y **varía ~50% entre temporada
   base y pico**, de modo que σ_aéreo debe calcularse como perfil mensual, nunca como escalar.
4. **La conectividad de Esquel es contractual, no espontánea.** La ruta COR–EQS opera bajo el
   programa de Conectividad Sostenible, con un piso de ocupación del 80% por debajo del cual la
   jurisdicción aporta fondos públicos. Eso le pone precio a cada punto de factor de ocupación y
   define el producto ancla del observatorio (`docs/07` §2).

**Qué hacer.** Antes de construir el subsistema, ejecutar el cálculo de **cuota estructural máxima
del canal aéreo** (§2.5 de `docs/02`) con los datos que ya tiene el OIT. El resultado condiciona la
prioridad del proyecto entero:

* Si el techo aéreo es bajo, la reorientación de
  pauta hacia emisores terrestres **no es una respuesta a alertas: es la política de base**, y el
  subsistema aéreo es sobre todo un **instrumento de evidencia para gestión y lobby** ante ANAC,
  Aerolíneas y la Secretaría de Transporte.
* El monitor de alerta temprana sigue teniendo valor, pero su objeto principal pasa a ser
  *capacidad agotada* (accionable: gestión de vuelos de refuerzo) más que *tarifa alta*.

Esto no reduce el alcance pedido: lo reordena para que el tablero responda la pregunta correcta.

---

## 🔴 H2 — Falta la capa de datos oficiales (ANAC/SIAC y EOH)

**El informe** propone inferir saturación aérea por scraping, con heurísticas como
`seats_remaining` ("últimos 3 asientos") e `is_sold_out`.

**El problema.** Esos campos son inobservables con el motor primario elegido y, cuando aparecen en
sitios de aerolíneas, son artefactos de marketing, no inventario real. Mientras tanto,
**ANAC/SIAC publica el dato verdadero en datos abiertos**: vuelos, pasajeros y butacas con grano
diario por par origen-destino, desde 2017, procesado y republicado por la Dirección Nacional de
Mercados y Estadística. Es decir, el **factor de ocupación aéreo real** por ruta es público,
oficial y gratuito, con nueve años de historia.

**Qué hacer.** Incorporar una **Capa 0 de fuentes oficiales** (ver `docs/05`) con dos ingestas:

| Fuente | Aporta | Grano | Latencia |
|---|---|---|---|
| ANAC/SIAC "Conectividad Aérea" | pasajeros, butacas, vuelos por OD → **factor de ocupación real** | Diario | ~1–3 meses |
| EOH (INDEC + Yvera) | ocupación hotelera oficial por región/localidad → **factor regional común** | Mensual | ~2 meses |

División de trabajo resultante, que es la arquitectura correcta:

> **ANAC = verdad retrospectiva y calibración de modelos. Scraping = precio prospectivo y alerta
> temprana.** Ninguna de las dos sustituye a la otra: ANAC no tiene precios y llega tarde; el
> scraping no ve ocupación real y no tiene pasado.

Beneficio adicional decisivo: resuelve el **arranque en frío**. Los modelos de elasticidad y
descomposición pueden calibrarse contra nueve años de historia oficial en lugar de esperar doce
meses de scraping propio.

---

## 🔴 H3 — El esquema `air_flight_observations` no puede calcular el TTCI

**El informe** define el TTCI sobre pasajes **ida y vuelta** y luego propone un esquema que solo
registra vuelos de un tramo.

**Defectos concretos del DDL propuesto:**

| # | Defecto | Consecuencia |
|---|---|---|
| 1 | No hay `return_date` ni `trip_type` | **El TTCI, indicador central del informe, no es computable.** |
| 2 | No hay `pax_count` | Las tarifas cambian con el tamaño del grupo; sin este campo las series son incomparables entre sí. |
| 3 | `UNIQUE (..., flight_number, ...)` con `flight_number` nullable | En PostgreSQL `NULL ≠ NULL`: el índice único **no deduplica** itinerarios con conexión. Duplicados silenciosos que inflan medianas. |
| 4 | No existe tabla de corridas de captura | **Imposible distinguir "no había vuelo" de "no se pudo medir".** Fatal para series históricas y para el semáforo de saturación. |
| 5 | `price_ars DOUBLE PRECISION` | Dinero en punto flotante binario. Usar `NUMERIC(12,2)`. |
| 6 | No hay `currency`, `fx_rate`, `fx_source`, `source`, `collector_version` | Sin trazabilidad. Inaceptable para un dato destinado a sustentar reclamos públicos. |
| 7 | `departure_time TIME` sin fecha ni zona horaria | Vuelos que cruzan medianoche y cambios de huso quedan mal ordenados. |
| 8 | `stopover_airports VARCHAR(50)` | Lista en un string. Usar `TEXT[]`. |
| 9 | `fare_brand`, `seats_remaining`, `is_sold_out` | Inobservables con el motor primario: quedarían siempre `NULL`, dando falsa sensación de cobertura. |

**Qué hacer.** Reemplazar por el DDL de [`specs/sql/01_air_schema.sql`](../specs/sql/01_air_schema.sql),
que agrega `itinerary_hash` generado (resuelve #3), la tabla `air_scrape_runs` (resuelve #4) y la
separación entre *precio* y *disponibilidad* como dos hechos distintos con distinta procedencia.

---

## 🔴 H4 — El TTCI mezcla unidades y por eso subestima el problema

**El informe** calcula: `TTCI = Vuelo + (N × ADR)`, y del ejemplo concluye que Bariloche es 22% más
barato.

**El problema.** La tarifa aérea es **por pasajero**; el ADR es **por unidad de alojamiento**.
Sumarlos directamente equivale a asumir 1 pasajero y 1 unidad. Con los mismos números del informe
y una familia de cuatro:

| | Aéreo | Alojamiento | Total | Diferencia |
|---|---|---|---|---|
| **Informe (implícito: P=1, u=1)** | | | | |
| Esquel, 4 noches | 450.000 | 280.000 | 730.000 | — |
| Bariloche, 4 noches | 130.000 | 440.000 | 570.000 | Bariloche −22% |
| **Corregido (P=4, u=1 cabaña)** | | | | |
| Esquel, 4 noches | 1.800.000 | 280.000 | 2.080.000 | — |
| Bariloche, 4 noches | 520.000 | 440.000 | 960.000 | **Bariloche −54%** |

El peso del componente aéreo **crece con el tamaño del grupo y decrece con la duración de la
estadía**. El informe subestima el problema justo en el segmento —familias— que más importa para un
destino de naturaleza.

**Qué hacer.** Parametrizar `P` (pasajeros), `N` (noches) y `c` (ocupación por unidad), y reportar
el TTCI normalizado **por persona y por noche**. De la corrección se deriva el indicador más
accionable del sistema, el **umbral de estadía compensatoria N\*** (§2.2 de `docs/02`).

---

## 🟠 H5 — Google Flights no es "RPC de Protocol Buffers"

**El informe** describe el motor primario como *"Google Internal Flights RPC (Protocol Buffers)"*
que devuelve datos estructurados.

**El problema.** El mecanismo real de `fast-flights` y librerías equivalentes es asimétrico: se
**codifica la consulta** en protobuf serializado y embebido en base64 en el parámetro `tfs` de la
URL, pero la **respuesta es HTML**, que se parsea con `selectolax`. No hay contrato de API en la
respuesta. Implicancias que cambian el plan de ingeniería:

* **Fragilidad ante cambios de markup**, no ante cambios de esquema. Un rediseño de Google rompe la
  extracción sin previo aviso y sin error explícito: devuelve cero filas o filas mal mapeadas.
* **Campos no disponibles**: familias tarifarias, asientos restantes, condición de agotado.
* El precio devuelto es el más barato por itinerario para la combinación `curr` / `gl` / `hl`
  solicitada, no una tarifa por clase.

**Qué hacer.** Tratar el parser como código propio versionado, no como dependencia opaca:
*vendorizar* el codificador protobuf, escribir parser propio con **fixtures de HTML** y tests de
contrato, y agregar un **canario de rendimiento de parseo** que alerte cuando el número de
itinerarios extraídos caiga más de 30% respecto de la mediana de 7 días. Ese canario es la única
defensa real contra la degradación silenciosa.

---

## 🟠 H6 — Amadeus Self-Service invertiría el resultado del análisis

**El informe** lista Amadeus Self-Service como fallback razonable.

**El problema.** Está confirmado que las APIs Self-Service **no exponen contenido de low-cost**;
eso requiere la suite Enterprise. Como Flybondi y JetSMART son exactamente la razón por la que
Bariloche resulta competitivo, un fallback vía Amadeus mostraría Esquel con su tarifa real y
Bariloche sin sus tarifas baratas: **el sesgo apunta en la dirección que invalida la tesis**. Es
peor que no tener dato, porque parece dato.

Duffel tiene un problema distinto pero igualmente descalificante: requiere acuerdos de distribución
con las aerolíneas y condición de vendedor de viajes; su cobertura doméstica argentina es marginal.

**Qué hacer.** Descartar ambos. Como seguro de continuidad usar **SerpApi** (engine
`google_flights`), que devuelve el mismo universo de contenido que el motor primario en JSON
estructurado, con presupuesto acotado a fechas críticas. Dimensionamiento en `docs/01` §3.

---

## 🟠 H7 — Comparar precios sin igualar anticipación genera alertas falsas permanentes

**El informe** propone umbrales del tipo `Tarifa EQS / Tarifa BRC > 1.7` sin condicionar por
anticipación.

**El problema.** El precio de un pasaje sube naturalmente al acercarse la fecha, y lo hace con
pendientes distintas en rutas monopólicas y competitivas. Comparar una observación de hoy contra un
promedio histórico que mezcla anticipaciones produce un sistema que **está siempre en alerta** —y
por lo tanto no informa nada.

**Qué hacer.** Toda comparación —ratio, z-score, pendiente— se calcula **dentro de celda**:
`(ruta × bucket de anticipación × día de semana × temporada)`. El estadístico debe ser robusto:

```
z = (x − mediana_celda) / (1.4826 × MAD_celda),   recortado a [−4, +4]
```

La mediana y el MAD resisten los outliers que genera cualquier scraper.

---

## 🟠 H8 — El monitor no puede funcionar en frío como está diseñado

**El informe** define umbrales que requieren distribuciones históricas propias que no existirán
hasta bien entrado el segundo año de operación.

**Qué hacer.** Fasear explícitamente el monitor, aprovechando que el benchmark simultáneo sustituye
a la historia ausente:

| Fase | Cuándo | Comparación disponible | Qué puede afirmar |
|---|---|---|---|
| **0** | Desde el día 1 | **Transversal**: EQS vs BRC/CPC hoy, misma anticipación | "Esquel está X% por encima del cluster para esta fecha y anticipación" |
| **1** | Mes 3+ | Intra-temporada: misma celda, semanas previas | "La brecha se amplió Y pp en 3 semanas" |
| **2** | Mes 12+ | Interanual completo + elasticidad estimada | "La brecha está en el percentil 95 histórico" |

La comparación transversal funciona desde la primera corrida porque ambas rutas se muestrean
simultáneamente. Es el activo más valioso del diseño de benchmark y el informe no lo aprovecha.

---

## 🟠 H9 — Series en pesos nominales son ininterpretables

**El informe** contempla ARS y USD con FX implícito diario.

**El problema.** Con la inflación argentina, una serie de ADR o de tarifa aérea en ARS nominal a 18
meses no es comparable consigo misma. Y la elección de FX (oficial, MEP) cambia la conclusión.

**Qué hacer.** Tres normalizaciones obligatorias en todas las series monetarias, con toggle en el
tablero: **ARS nominal**, **ARS constante** (deflactado por IPC-INDEC, mes base explícito) y **USD**
con `fx_source` registrado en cada fila. Y una regla editorial: el **indicador titular debe ser
siempre un ratio** (EQS/BRC), porque es inmune tanto a la inflación como a la elección de tipo de
cambio. Los ratios son además el argumento más difícil de refutar en una mesa de negociación.

---

## 🟠 H10 — El "dictamen automatizado" es estadística y políticamente riesgoso

**El informe** propone que el sistema emita veredictos categóricos: *«Causa primaria de baja
ocupación: estrangulamiento de oferta y tarifas aéreas, no resistencia al precio del alojamiento
local.»*

**El problema.** Es una afirmación causal derivada de datos observacionales, publicada por un
organismo público, con nombre y apellido implícito (Aerolíneas Argentinas). Un solo caso en que el
dictamen se demuestre errado destruye la credibilidad del observatorio entero, que es su único
activo.

**Qué hacer.** Sustituir el veredicto por una **descomposición aditiva con residuo explícito**
(§2.7 de `docs/02`), que se lee así:

> De los −18 pp de ocupación respecto del año anterior: −7 pp corresponden al factor regional
> común (todo el cluster patagónico cayó), −5 pp a reducción de plazas aéreas ofrecidas, −3 pp a
> tarifa aérea relativa, +1 pp a ventaja de precio hotelero, y **−4 pp permanecen sin explicar**.

Y aplicar un **gate de suficiencia** coherente con las reglas de mínimos muestrales que ya usa
`indicadores.py`: si no se cumplen, el tablero muestra "evidencia insuficiente" en lugar de un
número. Un observatorio que sabe decir *no sé* es el que puede ser creído cuando dice *sé*.

---

## 🟡 H11 — Un segundo PostgreSQL para aéreos es innecesario

**El informe** dibuja el subsistema aéreo con su propio PostgreSQL.

**El problema.** Volumen esperado: ~16 rutas × ~10 itinerarios × ~40 fechas × 365 días ≈ **1–3 M
filas por año**. El patrón de acceso es de un escritor nocturno y un lector nocturno. Un contenedor
PostgreSQL adicional cuesta RAM permanente en un VPS que ya corre dos stacks y Chromium.

**Qué hacer.** Patrón **bronce / plata / oro** sobre archivos, sin contenedor ni puerto nuevos:

* **Bronce:** `JSONL.gz` inmutable por corrida — permite reprocesar todo el histórico si se corrige
  el parser, sin volver a scrapear.
* **Plata:** Parquet particionado por `observed_date`, leído por DuckDB desde el ETL.
* **Oro:** las tablas Arrow que consume el tablero.

Sin locks, sin concurrencia, con replay total y auditabilidad completa. El DDL de
`specs/sql/01_air_schema.sql` se entrega igualmente porque define el **contrato lógico** de la capa
plata; se materializa como Parquet, y solo se instancia en PostgreSQL si algún día aparece un
consumidor server-side que lo justifique.

---

## 🟡 H12 — Vistas materializadas dentro de Métrica contradicen la directiva de no tocarla

**El informe** propone exportar desde vistas materializadas en el PostgreSQL de Métrica.

**El problema.** Una MV es un objeto nuevo dentro de la base de Métrica que además necesita un
`REFRESH` programado —es decir, un scheduler dentro de Métrica—. Eso es precisamente el
acoplamiento que la directiva quiere evitar. Con 360k observaciones tampoco hace falta: son
agregaciones de menos de un segundo.

**Qué hacer.** **Contrato de lectura versionado en el repo de Esquel Data**: el SQL vive en
`etl/contracts/metrica/*.sql` como CTEs, se ejecuta con un rol de solo lectura y `statement_timeout`,
y **no crea ningún objeto** en la base de Métrica. Ver [`specs/sql/02_metrica_contract.sql`](../specs/sql/02_metrica_contract.sql).
Escalar a vistas solo si el p95 de extracción supera los 10 s medidos, no por anticipación.

---

## 🟡 H13 — Riesgos operativos no cubiertos

Tres omisiones de la matriz de riesgos del informe:

**a) Aislamiento de fallos en el ETL.** Si `etl/build.py` aborta porque falta el dato aéreo, se cae
el tablero completo, incluidas las 24 tablas preexistentes que no tienen nada que ver. Exigir
`try/except` por tabla, `meta.json` extendido con disponibilidad y frescura por dataset, y
degradación elegante en el front (sección vacía con leyenda, nunca pantalla en blanco).

**b) Colisión de Chromium.** Si el scraper aéreo y el de Métrica levantan navegadores a la vez, el
VPS entra en presión de memoria. Un `flock` a nivel de host no es visible dentro del contenedor de
Métrica sin modificar su compose. Solución sin tocar Métrica: **guardia de preflight** que verifica
memoria disponible y cuenta procesos Chromium (`pgrep -c chromium`) y difiere la corrida si supera
umbral. Y el argumento más fuerte: **la estrategia primaria no usa navegador** —una request HTTP más
parseo de HTML consume ~60 MB frente a ~400 MB de Chromium—, de modo que en operación normal el
conflicto no llega a plantearse.

**c) Proxies residenciales.** El informe los propone como mitigación. Tienen costo mensual
recurrente y, más importante, **debilitan la defensa pública del dato**: un observatorio oficial
que evade controles con IPs residenciales tiene un problema si alguna vez debe explicar su
metodología. Con un presupuesto de ~150 consultas diarias espaciadas no hacen falta. Dejarlos fuera
del diseño base.

---

## Lo que se valida sin cambios

Para que la revisión no se lea como una enmienda a la totalidad:

* **Esquel DATA como núcleo ordenador y Métrica intacta en `:3013`** — correcto y sin alternativa
  mejor.
* **Arrow IPC + DuckDB-WASM con cómputo en el cliente** — correcto; es lo que permite cross-filtering
  en milisegundos sin costo de servidor, y es la decisión que más valor sostiene en el tiempo.
* **El grano de dos fechas (`stay_checkin` / `observed_date`)** heredado de Métrica y aplicado a
  aéreos — correcto y esencial; es lo que hace posible todo el análisis de anticipación.
* **La cadencia conceptual** (rolling 30 días, checkpoints mensuales, hitos estacionales) — correcta
  en su forma; solo requiere el presupuesto cuantitativo que falta (`docs/01` §4).
* **El cluster de benchmark patagónico** — correcto, y con más valor del que el informe le atribuye:
  es lo que permite operar el monitor desde el día 1 (H8) y lo que da identificación al modelo de
  paridad (§2.4 de `docs/02`).
