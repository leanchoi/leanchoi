# Prompt 1f — Corregir la cifra titular antes de que se publique

> El módulo "Curvas & Bandas" está muy bien hecho: la mediana sobre el promedio con su
> justificación, la banda IQR como zona habitual, la envolvente min-max, los small multiples
> para evitar el spaghetti, los bigotes en las barras mensuales, la guía de lectura y la tabla
> auditable. El diseño estadístico es correcto. El problema está en un número.

---

```
Repo: github.com/leanchoi/leanchoi, rama claude/esquel-data-ecosystem-integration-qbxuv2.
`git pull --rebase`.

===========================================================================
P0 — La brecha de +52,3% está mal calculada, y en contra nuestra
===========================================================================
El walkthrough publica como evidencia:
  BUE>EQS  174,89 $/km  (monopolio)
  BUE>BRC  114,82 $/km  (competitivo)
  Brecha estructural: +52,3%

Ese 114,82 $/km para Bariloche equivale a $153.319 de mediana. Contrastalo con
lo que midió el propio spike F0 en BUE→BRC a 30 días:
  Aerolíneas   $ 91.404  =  68,5 $/km
  JetSMART     $110.682  =  82,9 $/km
  Flybondi     $115.617  =  86,6 $/km
  mediana doméstica       =  82,9 $/km

La mediana del panel está +39% por encima de la mediana doméstica observada.
Eso es exactamente lo que producen unos pocos itinerarios vía São Paulo o
Santiago: son caros, y empujan la mediana hacia arriba.

Sensibilidad de la cifra según cómo se calcule:
  mediana agrupada, sin filtrar (panel actual)  +52,3%
  BRC solo doméstico                           +111,0%
  BRC solo Aerolíneas, AR contra AR            +155,5%

O sea: el panel eligió, sin decirlo, la versión que MÁS DEBILITA el argumento
del observatorio. Si alguien de Aerolíneas audita el número, encuentra que está
mal calculado y en contra nuestra. Eso es peor que un error a favor: quema la
credibilidad sin siquiera haber exagerado.

Tres causas, todas corregibles:

a) NO SE APLICÓ EL FILTRO DE PERTINENCIA del prompt 1d. LATAM y GOL no operan
   cabotaje argentino; sus itinerarios en rutas domésticas son desvíos
   internacionales. Y ojo con el razonamiento del walkthrough: dice que la banda
   IQR es "inmune a tarifas de desvío internacional". NO LO ES. El IQR recorta
   las colas, pero si el 10-15% de los itinerarios de BRC son desvíos caros,
   empujan la mediana y el P75 hacia adentro de la banda. El IQR no reemplaza al
   filtro. Implementá itinerario_relevante y excluí los no pertinentes de todo
   agregado.

b) SE COMPARAN MEDIANAS AGRUPADAS. Una mediana sobre 180 días y todas las
   anticipaciones no es una "brecha estructural": es el promedio de dos
   distribuciones con composición distinta. Si EQS tiene barridos 180 días y BRC
   una cadencia menor, las medianas cubren mezclas de fechas diferentes, y solo
   eso puede mover una mediana un 30%. La regla transversal del proyecto (H7,
   docs/00) es que TODA comparación se hace dentro de celda:
   ruta x bucket de anticipación x día de semana x temporada.

c) SE ELIGIÓ LA COMPARACIÓN MÁS DÉBIL. La comparación fuerte es AR contra AR:
   la misma aerolínea, en su ruta monopólica y en una competitiva de distancia
   similar. Controla flota, estructura de costos y mercado emisor de una sola
   vez: la única variable que cambia es la competencia. Está en el catálogo como
   prima_monopolio_ar_pct (specs/catalogo/indicadores.yaml). Es la que hay que
   destacar.

QUÉ HACER:
  · Aplicar el filtro de pertinencia y recalcular.
  · Reportar la brecha SIEMPRE dentro de celda, con n y cobertura al lado.
  · Publicar las tres versiones en la tabla auditable —agrupada, doméstica y AR
    contra AR— con su definición. Que el lector vea cuál mira.
  · La cifra titular es prima_monopolio_ar_pct, no la mediana agrupada.
  · Y mientras la cobertura de una celda no llegue al mínimo, la cifra va marcada
    como preliminar (I8) y no sale del organismo (I15).

===========================================================================
P1 — Pendientes de 1d y 1e que quedaron sin hacer
===========================================================================
El módulo de visualización se construyó sobre datos sin corregir. Antes de
seguir agregando vistas, cerrar:
  · Filtro de pertinencia (1d P0) — es la causa (a) de arriba.
  · Los 7 sin_resultados enumerados y clasificados (1d P1).
  · Autenticación del panel (1d P1): sigue abierto a internet con indicadores
    grado C.
  · Tabla de vuelos con las 12 columnas ordenables (1e P1).
  · Cobertura por mes visible y fechas sin muestrear mostradas como tales (1e P1).
  · Spike del grid de fechas y barrido de 180 días por etapas (1e P0).

Reportá el estado de cada uno: hecho, no hecho, o hecho parcialmente.

===========================================================================
P1 — Dónde vive el cálculo: hay que decidirlo ahora
===========================================================================
calcular_series_temporales() en server.py computa percentiles, agregaciones y
normalización por km. Según la arquitectura acordada, ese cálculo va en el ETL y
en DuckDB-WASM dentro de Esquel Data.

Si Esquel Data lo recalcula por su lado, vamos a tener DOS medianas para la misma
ruta y el mismo mes, calculadas distinto. Es exactamente la ambigüedad semántica
que docs/06 existe para prevenir, y es cara de deshacer una vez que alguien citó
un número.

El panel de 38530 ya tiene: tarjetas KPI, tabla comparativa, explorador de
vuelos, bitácora, canario, calendario y ahora un módulo estadístico completo. Eso
es, de hecho, la fase F4 construida en otro lado, en vanilla JS en vez del stack
React + DuckDB-WASM, y sin el catálogo semántico. La decisión no se puede seguir
posponiendo, porque cada semana de desarrollo encarece la convergencia.

NO decidas esto por tu cuenta: PREGUNTALE A LEANDRO cuál de los dos caminos
quiere, y explicale el costo de cada uno.
  Camino A — el panel es la consola de operación y las vistas analíticas migran a
    Esquel Data en F4. Se conserva el trabajo portando los componentes.
  Camino B — el panel es el producto de aéreos y Esquel Data lo enlaza o lo
    embebe. Entonces necesita el catálogo, el sistema de diseño, los roles y la
    autenticación de Esquel Data, y F4 se redefine.

En cualquiera de los dos, HOY: las funciones de cálculo estadístico
(percentiles, buckets de celda, normalización) se extraen a un módulo compartido
con una sola definición, y las etiquetas y unidades se leen de
generated/web/indicadores.ts. Que el número sea uno solo, viva donde viva.

===========================================================================
CRITERIOS DE ACEPTACIÓN
===========================================================================
  1. Filtro de pertinencia aplicado; reportado cuánto se movieron la mediana y el
     mínimo de BUE>BRC al aplicarlo.
  2. Las tres versiones de la brecha visibles en la tabla auditable, con su
     definición y su n.
  3. La cifra titular es prima_monopolio_ar_pct, calculada dentro de celda.
  4. Toda cifra con cobertura bajo el mínimo, marcada preliminar.
  5. Estado reportado de los seis pendientes de 1d y 1e.
  6. Cálculo estadístico extraído a un módulo compartido con definición única.
  7. La pregunta sobre el camino A o B, planteada a Leandro con sus costos.
```
