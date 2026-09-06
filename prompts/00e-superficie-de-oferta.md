# Prompt 1e — Superficie de oferta completa y tabla ordenable

> Leandro detectó que el panel muestra 3 fechas de septiembre y nada después del 6 de diciembre,
> cuando Aerolíneas vende hasta junio de 2027. Tiene razón, y no es un bug del scraper.

---

```
Repo: github.com/leanchoi/leanchoi, rama claude/esquel-data-ecosystem-integration-qbxuv2.
`git pull --rebase`. Leé docs/01-motor-aereos.md §4 antes de tocar schedule.py.

===========================================================================
EL DIAGNÓSTICO (no es lo que parece)
===========================================================================
La extracción por fecha está BIEN. BUE→EQS devuelve 1-2 itinerarios porque eso
es lo que opera ese día. El problema es cuántas FECHAS se consultan:

  mes       muestreadas / con servicio
  2026-09        3 / 19    16%
  2026-10       10 / 27    37%
  2026-11        5 / 26    19%
  2026-12        1 / 26     4%
  2027-01        0 / 27     0%
  2027-02        0 / 24     0%

Ventana de venta real: ~296 días (hasta junio 2027).
Horizonte del planificador: 90 días.
CIEGO: 206 días, el 70% de la ventana de venta.

Causa: F1a se diseñó como colector mínimo con solo fechas ancla (viernes +
hitos) a 90 días. Eso optimiza la CURVA DE ANTICIPACIÓN —pocas fechas, muchas
observaciones repetidas—, que es lo que necesita el monitor de alerta temprana.
Lo que hace falta ahora es otra cosa: la SUPERFICIE DE OFERTA completa.

Son dos objetivos distintos y hacen falta LOS DOS. No reemplaces el modo ancla:
agregá uno nuevo.

===========================================================================
P0-A — Spike: ¿es alcanzable el grid de fechas de Google Flights?
===========================================================================
Esto decide todo lo demás, hacelo primero y reportá antes de seguir.

La UI de Google Flights tiene "gráfico de precios" y una grilla de calendario
que muestran el precio más barato por día de ~2 meses EN UNA SOLA CONSULTA.
Si ese request es alcanzable con el mismo protocolo tfs que ya vendorizaste:

  300 días / 60 por grilla = 5 consultas por sentido, no 300.
  10 sentidos x 5 grillas, refresco semanal = 7 consultas/día.
  Colapsa el barrido completo de 165 consultas/día a 7. Factor de 23x.

Cómo investigarlo: abrí Google Flights en el navegador con las herramientas de
desarrollo, activá el gráfico de precios / la grilla de fechas, y mirá qué
request sale y cómo está armado su tfs. Es el mismo tipo de ingeniería inversa
que ya hiciste para la consulta normal.

REPORTÁ: si es alcanzable, su forma y qué campos devuelve. Si no lo es, decilo
y pasamos al plan B de abajo. No inviertas más de medio día en esto.

===========================================================================
P0-B — Modo "barrido de calendario", con cadencia decreciente
===========================================================================
Cobertura total NO significa frecuencia uniforme. Lejos alcanza con menos:

  ventana                fechas   cada    cons/día/sentido
  T+1  .. T+60               60     7d                 8,6
  T+61 .. T+180             120    14d                 8,6
  T+181.. fin de venta      ~120    30d                 4,0
  TOTAL por sentido         ~300                       21,1

CON GRID (si el spike sale bien):
  · El barrido lo hace el grid: 7 consultas/día para los 10 sentidos.
  · La consulta detallada (itinerarios, horarios, escalas, operador) se reserva
    para: fechas ancla + todas las fechas operadas de T+1..T+45 en el núcleo +
    cualquier fecha donde el grid muestre un salto de precio anómalo.
  · Presupuesto: 172 (ancla) + 7 (grid) + ~26 (detalle) = ~205/día. Entra en 250.

SIN GRID (fuerza bruta, hay que priorizar y decirlo):
  · Barrido completo SOLO para BUE↔EQS y COR↔EQS (4 sentidos): 85 consultas/día.
  · Benchmark BRC/CPC: barrido mensual, no quincenal.
  · Y hay que bajar el modo ancla: ventana densa diaria solo para tier 1, tier 2
    cada 2 días.
  · Reportá el total resultante. Si no entra en 250, decilo explícitamente en vez
    de truncar: la elevación escalonada del tope (250→275→300) ya está prevista en
    global.politica_de_tope y requiere 14 días limpios por paso.

===========================================================================
P1 — Descubrir el horizonte de venta, no hardcodearlo
===========================================================================
"Hasta junio 2027" es de hoy; se corre solo. Una vez por semana, buscá el borde:
consulta binaria sobre la fecha más lejana que todavía devuelve itinerarios.
Guardalo como propiedad medida de la ruta (horizonte_venta_dias), y usalo como
límite del barrido. Es además un dato interesante en sí: cuándo abre la venta de
temporada es una señal comercial.

===========================================================================
P1 — El panel hace pasar un hueco de muestreo por ausencia de vuelos
===========================================================================
Esto es lo que llevó a la confusión y es un problema de fondo, no cosmético.
La tabla muestra 3 filas de septiembre y parece que hubiera 3 vuelos. Viola I8
y I13: toda serie declara su cobertura, y nunca se muestra vacío como si fuera
un cero medido.

  · Encabezado por mes: "septiembre: 3 de 19 días con servicio muestreados (16%)".
  · Las fechas con servicio NUNCA consultadas se muestran como fila atenuada con
    la leyenda "sin muestrear", no se omiten. Que el hueco se vea.
  · Distinguir visualmente: sin muestrear / sin servicio (calendario) / sin
    resultados (no sé por qué) / con datos.

===========================================================================
P1 — Tabla ordenable
===========================================================================
En la pestaña de exploración de vuelos, orden por clic en el encabezado,
ascendente y descendente, sobre TODAS estas columnas:

  fecha de vuelo · día de semana · días de anticipación (lead) · aerolínea ·
  hora de salida · hora de llegada · duración · escalas · precio ARS ·
  precio por km · fecha de observación · estado

  · Indicador visual de la columna y el sentido activos.
  · Orden por defecto: fecha de vuelo ascendente.
  · El orden se aplica sobre el conjunto FILTRADO completo, no sobre la página
    visible.
  · Valores numéricos con tabular-nums, alineados a la derecha (ya lo venís
    haciendo bien).
  · "Días de anticipación" es la columna que Leandro pidió explícitamente:
    calculada como fecha_vuelo - fecha_observación, no como días desde hoy.

===========================================================================
CRITERIOS DE ACEPTACIÓN
===========================================================================
  1. Reportado si el grid es alcanzable y con qué forma.
  2. BUE↔EQS con cobertura de fechas >= 95% de los días con servicio en
     T+1..T+180, y >= 80% hasta el fin de la ventana de venta.
  3. horizonte_venta_dias medido por ruta, no hardcodeado.
  4. El panel muestra cobertura por mes y las fechas sin muestrear como tales.
  5. Las 12 columnas ordenables en ambos sentidos, sobre el filtrado completo.
  6. Presupuesto diario reportado. Si no entra en 250, dicho explícitamente con
     la propuesta de qué se prioriza.
  7. El modo ancla sigue funcionando: la curva de anticipación no se degrada.
     Verificalo — es lo que alimenta el monitor.

NO rediseñes el modo ancla para "ahorrar". Son dos objetivos distintos: la
superficie de oferta responde "qué hay disponible", la curva de anticipación
responde "cómo evoluciona el precio de una fecha". El segundo es el que permite
anticipar, y es el que no se puede reconstruir después.
```
