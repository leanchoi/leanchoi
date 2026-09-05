# Esquel DATA 360° — Revisión crítica y especificación de integración

Revisión técnica del informe *"ESQUEL DATA 360°: Arquitectura de Integración Turística Integral"*
(5-sep-2026), con profundización analítica y plan de implementación modular para el VPS
`187.77.224.159`.

**Alcance:** integrar en **Esquel DATA** (`:38520`) los datos productivizados por **MÉTRICA**
(`:3013`, sin tocar su despliegue) y diseñar el subsistema **MÉTRICA AÉREOS**, con un modelo de
correlación tripartita (demanda real OIT × mercado OTA × conectividad aérea) que funcione tanto
retrospectiva como prospectivamente.

---

## Índice

| Documento | Contenido |
|---|---|
| [`docs/00-revision-critica.md`](docs/00-revision-critica.md) | 13 hallazgos que modifican el diseño original, ordenados por impacto. **Leer primero.** |
| [`docs/01-motor-aereos.md`](docs/01-motor-aereos.md) | Punto 1: evaluación comparada de motores de captura y diseño de cadencia con presupuesto de consultas. |
| [`docs/02-modelo-analitico.md`](docs/02-modelo-analitico.md) | Punto 2: TTCI corregido, umbral N\*, paridad hedónica, descomposición causal y Monitor de Alerta Temprana. |
| [`docs/03-pipeline-datos.md`](docs/03-pipeline-datos.md) | Punto 3: contrato de lectura con Métrica, patrón bronce/plata/oro, presupuestos de bytes y patrones SQL para DuckDB-WASM. |
| [`docs/04-plan-implementacion.md`](docs/04-plan-implementacion.md) | Punto 4: fases F0–F7 con criterios de aceptación, rollback e invariantes de no-regresión. |
| [`docs/05-fuentes-oficiales.md`](docs/05-fuentes-oficiales.md) | Capa de datos oficiales (ANAC/SIAC, EOH-INDEC) que el informe original no contemplaba. |
| [`docs/06-productivizacion.md`](docs/06-productivizacion.md) | **Cómo esto no termina siendo un despelote**: catálogo semántico, mapa pregunta→decisión, jerarquía de lectura, motor de insights, semáforo de confianza, productos de salida y gobernanza. |
| [`docs/07-conectividad-sostenible.md`](docs/07-conectividad-sostenible.md) | Corrección de capacidad, el programa de Conectividad Sostenible como producto ancla, panel histórico 2017–2026 y diseño cuasi-experimental. |
| [`specs/`](specs/) | Artefactos listos para implementar: DDL corregido, contrato SQL, patrones DuckDB, catálogo semántico, configuración de cadencia, scripts. |
| [`AGENTS.md`](AGENTS.md) | **Reglas duras para el agente que implemente**: invariantes, decisiones cerradas, supuestos a verificar, definición de terminado. |
| [`prompts/`](prompts/) | **Ocho prompts de implementación**, autocontenidos, en orden de prioridad. Pegar de a uno. |

---

## Para implementar

Empezar por [`prompts/00-arranque.md`](prompts/00-arranque.md) — es el urgente: valida el
motor de captura y pone a andar el colector mínimo. El resto sigue el orden de
[`prompts/README.md`](prompts/README.md). El agente debe leer [`AGENTS.md`](AGENTS.md)
antes de cada tarea.

---

## Resumen ejecutivo de la revisión

El informe original es **arquitectónicamente correcto en su decisión central** —Esquel DATA como
núcleo ordenador, Métrica intacta, Apache Arrow + DuckDB-WASM como capa de consumo— y esa decisión
se **valida sin reservas**. Las objeciones son de otro orden: la **tesis de negocio está mal
calibrada**, faltan dos fuentes de datos que vuelven innecesario buena parte del scraping, y el
esquema de datos propuesto no puede calcular el indicador estrella del propio informe.

### Los cuatro cambios de fondo

**1. Esquel tiene un problema de competencia y de contrato, no de precio.**
Una sola aerolínea (Aerolíneas Argentinas) y un solo origen directo regular (AEP), con **6
frecuencias semanales de base —diario salvo martes—, 7 en agosto-septiembre por la ruta Córdoba y
hasta 9 en Tulipanes**. Bariloche, en cambio, tiene tres operadores compitiendo. La brecha
tarifaria EQS/BRC no es una decisión comercial arbitraria: es el precio de sombra de un mercado sin
competencia. Esto reordena todo:

* El indicador estrella no es *tarifa por kilómetro* sino **plazas aéreas por cada 1.000 plazas
  hoteleras** y la **descomposición del gap** entre distancia, competencia y frecuencias (§3.2 y
  §4.1 de `docs/02`).
* La cuota estructural del canal aéreo (σ_aéreo) es un **perfil mensual, no un número**: varía ~50%
  entre temporada base y pico. Define cuánta pauta tiene sentido dirigir al canal aéreo en cada mes.
* **La ruta Córdoba–Esquel opera bajo el programa de Conectividad Sostenible, con un piso de
  ocupación del 80% por debajo del cual la provincia aporta fondos públicos.** Eso le pone precio a
  cada punto de factor de ocupación y define el producto ancla del observatorio: el tablero de
  riesgo fiscal y el informe de renovación de ruta (`docs/07`).

**2. Falta la fuente oficial que da gratis lo que el scraping no puede dar.**
ANAC/SIAC publica en datos abiertos, con grano **diario y por par origen-destino**, vuelos,
pasajeros y **butacas** desde 2017. Es decir: el **factor de ocupación aéreo real** —la variable que
el informe quiere inferir con heurísticas de scraping ("últimos 3 asientos")— es un dato público,
oficial, con nueve años de historia. Esto resuelve además el problema de arranque en frío del
modelo. División de trabajo correcta: **ANAC = verdad retrospectiva y calibración; scraping =
precio prospectivo**. Sumar EOH (INDEC + Yvera) da el factor regional común para la descomposición
causal. Ver `docs/05`.

**3. El esquema propuesto no puede calcular el TTCI.** `air_flight_observations` no tiene
`return_date`, `trip_type` ni `pax_count`, y el TTCI se define sobre pasajes **ida y vuelta por
pasajero**. Además el `UNIQUE` sobre `flight_number` no deduplica cuando ese campo es `NULL`
(en PostgreSQL `NULL ≠ NULL`), no hay tabla de corridas —por lo que es imposible distinguir *"no
había vuelo"* de *"no se pudo medir"*—, y tres columnas (`fare_brand`, `seats_remaining`,
`is_sold_out`) son inobservables con el motor primario elegido. DDL corregido en
[`specs/sql/01_air_schema.sql`](specs/sql/01_air_schema.sql).

**4. El TTCI del informe mezcla unidades y subestima el problema.** La tarifa aérea es *por
pasajero*; el ADR es *por unidad de alojamiento*. El ejemplo del informe (Esquel 22% más caro)
asume implícitamente 1 pasajero y 1 unidad. Con una familia de 4 personas el mismo cálculo da
**Bariloche ≈54% más barato**, porque el componente aéreo escala con el grupo y el hotelero no. De
esa corrección sale el indicador más accionable de todo el sistema, el **umbral de estadía
compensatoria N\***: el número de noches a partir del cual la ventaja hotelera de Esquel compensa
la desventaja aérea. Si N\* excede la estadía media real, la ventaja de precio hotelero **nunca se
materializa** y el marketing debe segmentarse a estadías largas.

### Lo que se descarta y por qué

* **Amadeus Self-Service:** confirmado que no expone low-cost. Como Flybondi y JetSMART son
  exactamente la razón por la que Bariloche es competitivo, comparar Esquel (contenido GDS) contra
  Bariloche (sin low-cost) invertiría el resultado. Inservible para este caso de uso.
* **Duffel:** requiere acuerdos de distribución y condición de vendedor de viajes; cobertura
  doméstica argentina marginal.
* **Playwright contra `aerolineas.com.ar` como estrategia general:** el WAF es un adversario caro y
  el retorno marginal es bajo, porque AR es monopolista en EQS y su tarifa ya aparece en Google
  Flights. Se reserva para lo único que Google no entrega —familias tarifarias y disponibilidad de
  asientos— y solo sobre fechas ancla, ≤20 consultas semanales.
* **Un segundo PostgreSQL para aéreos:** innecesario. El volumen esperado (1–3 M filas/año) y el
  patrón de acceso (un escritor nocturno, un lector nocturno) se resuelven con archivos Parquet
  particionados, sin contenedor ni puerto nuevos.
* **Vistas materializadas dentro de Métrica:** con 360k observaciones no hacen falta, y obligan a
  programar `REFRESH` dentro de Métrica, que es justamente lo que no se quiere tocar.

### Lo que se confirma

El eje Arrow IPC → DuckDB-WASM es la decisión correcta y se conserva íntegra, con dos precisiones
operativas: **presupuesto explícito de bytes por tabla** (≤2 MB) con la aritmética de filas hecha
por adelantado, y **cálculo del TTCI en el navegador** —no en el ETL—, porque depende de parámetros
que elige el usuario (noches, pasajeros, moneda) y precomputarlo multiplicaría las tablas sin
necesidad.

### Sobre la productivización

`docs/06` responde la preocupación de fondo —*que no sea un despelote y que se aproveche*— con
siete capas, cada una atacando un modo de falla concreto: catálogo semántico como fuente única
(genera los tipos del tablero, los validadores del ETL y la ficha metodológica, y CI falla si
divergen), mapa de doce preguntas de negocio con su decisor, jerarquía de lectura en tres niveles
—titular / diagnóstico / evidencia— que es la respuesta real a "no queremos pestañas aisladas",
motor de insights declarativo en YAML en vez de lógica dispersa en componentes, semáforo de
confianza A/B/C/D con reglas de publicación, seis productos de salida además del tablero, y
gobernanza por rol.

La regla que ordena todo: **cada número existe porque alguien va a hacer algo distinto al
conocerlo.** Un indicador que no puede completar el campo `decision` no entra al catálogo, y por lo
tanto no entra al tablero.

### Regla de perecibilidad y prioridad revisada

El dato de precios es **perecedero**: la tarifa de hoy para el 12 de octubre no se recupera mañana.
ANAC, en cambio, se puede backfillear entero desde 2017 en cualquier momento. Como las decisiones
de compra se definen en una ventana de ~3 meses, cada día sin captura es una curva de anticipación
que nunca se va a tener. Por eso el plan se reordena: **un colector mínimo (F1a) arranca en paralelo
con el spike**, no después. Detalle en `docs/07` §6.

### Advertencia sobre verificación

Las cifras de infraestructura del informe (5.329 listings, 359.978 observaciones, rutas, puertos) se
toman como dadas: no hay acceso al VPS desde este entorno. Las frecuencias de Esquel provienen del
conocimiento local del OIT y se contrastaron con prensa; **los agregadores de horarios resultaron
poco confiables** —para la misma ruta y mes se hallaron cifras de 3, 4, 6 y 27 frecuencias
semanales—, de modo que no se usan como fuente. Los datos de conectividad se
contrastaron contra fuentes públicas y quedan marcados para reconfirmación desde el servidor. Dos
afirmaciones del informe original **no pudieron verificarse y no deben darse por ciertas**: que
Aerolíneas Argentinas use SabreSonic (la evidencia disponible apunta más bien a Amadeus Altéa, y en
cualquier caso el dato no es determinante para el diseño) y que Google Flights liste tarifas de
Flybondi en todas las rutas argentinas. Esta segunda **sí es determinante** y es la primera prueba
del spike F0. Los portales `.gob.ar` están bloqueados por el proxy de egreso de este entorno, de
modo que la estructura exacta de los CSV de ANAC debe confirmarse desde el VPS antes de escribir el
parser.
