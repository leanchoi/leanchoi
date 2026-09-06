# Prompt 1e — Barrido diario completo a 180 días

> Reemplaza por completo la versión anterior de este prompt, que partía de un requisito mal
> entendido. El objetivo es más simple y más exigente: **todos los vuelos, todas las fechas,
> todos los días, a 180 días vista.**

---

```
Repo: github.com/leanchoi/leanchoi, rama claude/esquel-data-ecosystem-integration-qbxuv2.
`git pull --rebase`.

===========================================================================
EL REQUISITO
===========================================================================
Ventana MÓVIL de 180 días. Todas las fechas. Todos los vuelos. Todos los días.
  Hoy 6/9  -> se observan todas las fechas hasta el 6/2.
  Mañana   -> hasta el 7/2.

Y el objetivo INMEDIATO de la pestaña de vuelos es una FOTO: cuánto sale hoy,
realmente, cada vuelo de cada día. No la evolución del precio — eso va en otra
pestaña más adelante. La base histórica se acumula sola mientras tanto.

===========================================================================
SIMPLIFICACIÓN: se retira el modo ancla
===========================================================================
Buena noticia. Si barrés las 180 fechas todos los días, cada fecha acumula 180
observaciones a medida que se acerca. La curva de anticipación sale GRATIS, y
más densa que con el modo ancla, que era diario solo en T-45..T-1 y cada 3 días
más lejos.

O sea: UN SOLO MODO. Retirá generar_fechas_ancla() y el conjunto ancla de la
config. Menos piezas móviles y mejor dato. Conservá el calendario de hitos solo
como metadato para etiquetar fechas en el tablero, no como criterio de muestreo.

===========================================================================
EL LÍMITE NO ES EL VPS
===========================================================================
Medido anoche: 16,1 s de CPU para 172 consultas = 0,094 s cada una.
  1.800 consultas = 2,8 minutos de CPU. Nada.
  RAM: 65 MB y no sube, porque es secuencial.
  Disco: 1.800 x ~5 KB de blob = 8,8 MB/día = 0,8 GB a 90 días. Entra holgado.

El servidor aguanta de sobra. Lo que no sabemos es cuánto tolera Google: F0-3
validó 30 consultas y hoy vamos 172 sin bloqueos. 1.800 es otro régimen y no
hay forma de saberlo sin medirlo.

Costo en tiempo de reloj, 10 sentidos x 180 fechas = 1.800 consultas:
    30s -> 15,0 h   imposible
    15s ->  7,5 h   imposible
    12s ->  6,0 h   entra abriendo la ventana 00:00-06:00
    10s ->  5,0 h   entra abriendo la ventana 00:00-06:00
     6s ->  3,0 h   entra en 02:00-05:00

===========================================================================
P0-A — SPIKE PRIMERO: el grid de fechas (medio día, máximo)
===========================================================================
Si el grid es alcanzable, nada del plan por etapas hace falta.

La UI de Google Flights tiene "gráfico de precios" y grilla de calendario, que
muestran el precio más barato por día de ~2 meses EN UNA CONSULTA.
  180 días / 60 por grilla = 3 consultas por sentido.
  10 sentidos x 3 = 30 consultas/día para TODA la superficie, todos los días.
  Contra 1.800. Factor de 60x.

Cómo: abrí Google Flights con las herramientas de desarrollo, activá el gráfico
de precios y la grilla, y mirá el request y su tfs. Misma ingeniería inversa que
ya hiciste.

El grid da precio más barato por fecha, NO número de vuelo, horarios ni operador.
Para BUE-EQS, que tiene 1-2 vuelos por día, el más barato es casi toda la foto.
Así que el diseño con grid queda:
  · GRID diario -> precio de todas las fechas de los 180 días, todos los sentidos.
  · DETALLADA   -> itinerarios completos. Con el ahorro del grid, alcanza para
                   barrer en detalle los 180 días del núcleo igual.

REPORTÁ el resultado del spike ANTES de implementar el plan por etapas.

===========================================================================
P0-B — Plan por etapas (si el grid no sirve, o mientras tanto)
===========================================================================
Empezar por lo que importa, medir, y recién después ampliar.

  Etapa 1  BUE↔EQS                     2 sentidos    360 cons/día  15s  1,5 h
  Etapa 2  + BUE↔BRC                   4 sentidos    720 cons/día  12s  2,4 h
  Etapa 3  + CPC y COR (con ventana)   8 sentidos  1.440 cons/día  10s  4,0 h

  · Se pasa de etapa con 7 días consecutivos de 0 bloqueos.
  · Ante CUALQUIER bloqueo se vuelve a la etapa anterior y se reporta.
  · La etapa 1 ya entrega exactamente lo que se pidió, en la ruta que es el
    objeto del observatorio. Arrancá por ahí HOY, no esperes a tener las tres.
  · Ventana horaria: ampliable a 00:00-06:00 si hace falta. Verificá que no
    solape con la ventana de Métrica antes de correrla.
  · El tope duro de 250 en la config queda obsoleto: reemplazalo por el tope de
    la etapa vigente, y que el circuit breaker siga siendo lo que corta.

AHORRO OBVIO: COR↔EQS opera ~9 semanas al año. Barrer 180 días x 365 días para
esa ruta son 131.400 consultas anuales de una ruta que casi nunca vuela.
Restringila a su ventana de operación + 30 días de margen a cada lado. Lo mismo
para cualquier ruta estacional que aparezca.

===========================================================================
P1 — La pestaña: foto de hoy, no serie temporal
===========================================================================
Consulta simple: la ÚLTIMA observación de cada (ruta, fecha de vuelo, vuelo).
Nada de agregaciones temporales todavía.

Columnas, todas ordenables por clic ascendente y descendente:
  fecha de vuelo · día de semana · días de anticipación · aerolínea ·
  número de vuelo · hora de salida · hora de llegada · duración · escalas ·
  precio ARS · precio por km · observado el

  · Orden por defecto: fecha de vuelo ascendente.
  · El orden se aplica sobre el conjunto FILTRADO completo, no sobre la página.
  · Indicador visual de columna y sentido activos.
  · "Días de anticipación" = fecha_vuelo - fecha_observación.
  · Números con tabular-nums alineados a la derecha.

Y lo que causó la confusión, que es de fondo y no cosmético: HOY LA TABLA HACE
PASAR UN HUECO DE MUESTREO POR AUSENCIA DE VUELOS. Viola I8 e I13.
  · Encabezado por mes con cobertura: "septiembre: 19 de 19 días con servicio".
  · Las fechas con servicio nunca consultadas se muestran atenuadas con la
    leyenda "sin muestrear". Que el hueco se vea, no que desaparezca.
  · Cuatro estados distinguibles: con datos / sin muestrear / sin servicio /
    sin resultados.

===========================================================================
CRITERIOS DE ACEPTACIÓN
===========================================================================
  1. Reportado si el grid es alcanzable, con qué forma y qué campos.
  2. Etapa 1 corriendo: BUE↔EQS con TODAS las fechas de T+1..T+180, todos los
     días. Cobertura >= 98% de los días con servicio.
  3. El modo ancla retirado; la curva de anticipación se verifica que sigue
     saliendo (ahora más densa) desde el barrido.
  4. COR↔EQS restringida a su ventana de operación.
  5. La pestaña muestra la última observación por vuelo, con las 12 columnas
     ordenables sobre el filtrado completo.
  6. Cobertura por mes visible y fechas sin muestrear mostradas como tales.
  7. Reportado: consultas/día, espaciado, duración de corrida, CPU, RSS, disco
     por día, y bloqueos. Con esos números decidimos la etapa siguiente.

No optimices por adelantado bajando la cobertura para "cuidar el VPS": el VPS no
es el límite y ya está medido. Si algo obliga a recortar, que sea un bloqueo real
de Google, medido, y reportado — no una precaución.
```
