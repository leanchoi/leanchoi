# Prompt 1g — Escalera tarifaria, cobertura de red y dólar

> Sale de una captura de `aerolineas.com.ar` que trajo Leandro. Contiene el hallazgo más
> importante del proyecto hasta ahora, y explica por qué la banda del gráfico "no cierra".

---

```
Repo: github.com/leanchoi/leanchoi, rama claude/esquel-data-ecosystem-integration-qbxuv2.
`git pull --rebase`: hay tablas nuevas en specs/sql/01_air_schema.sql, clases de ruta
en specs/config/rutas_muestreo.json y 5 indicadores nuevos en el catálogo.

===========================================================================
P0 — LA ESCALERA TARIFARIA. Lo más importante de esta ronda.
===========================================================================
La captura de aerolineas.com.ar para BUE→EQS del 07/09 muestra DOS vuelos
(EZE 08:30 y AEP 12:40) y, sobre cada uno, CINCO familias tarifarias:

    Base                    $167.985
    Plus                    $192.616
    Flex                    $236.238
    Promo Premium Economy   $284.660   ¡Quedan 3 lugares!
    Premium Economy         $321.256   ¡Quedan 5 lugares!

El panel muestra, para esa semana, "Máximo $167.985". No está mal calculado:
está MAL ETIQUETADO. Google Flights devuelve la tarifa MÁS BARATA por
itinerario, así que lo que el panel llama "máximo" es en realidad "el más caro
entre los mínimos de cada vuelo". En un observatorio eso es tan grave como un
error de cálculo. Renombralo hoy mismo, antes de capturar la escalera.

POR QUÉ ESTO DECIDE EL ARGUMENTO CENTRAL DEL PROYECTO

Si la semana que viene la tarifa mínima de una fecha subió, hay dos causas
posibles y son OPUESTAS:

  · Se agotó el escalón barato. La escalera está igual, solo que Base ya no
    está disponible. EL AVIÓN SE ESTÁ LLENANDO: hay demanda y la restricción
    es la capacidad.        => el reclamo correcto es POR MÁS FRECUENCIAS.

  · Subió toda la escalera. La aerolínea repreció con la misma
    disponibilidad.        => el reclamo correcto es POR TARIFA.

Con solo el mínimo, los dos casos se ven idénticos: "subió el pasaje". Con la
escalera, se separan exactamente. Es la diferencia entre "vuelos saturados" y
"tarifas expulsivas", que es LA pregunta del observatorio desde el informe
original, y hasta ahora no teníamos con qué responderla.

Descomposición, entre dos observaciones de la misma fecha de vuelo, con
c = clase más barata disponible y p_t(c) = precio de la clase c en t:

    Δln(p_min) = [ln p_t(c_ant) − ln p_ant(c_ant)]  +  [ln p_t(c_hoy) − ln p_t(c_ant)]
                  \____ efecto PRECIO ____/             \__ efecto COMPOSICIÓN __/

Está en el catálogo como efecto_precio_pp y efecto_composicion_pp. Si falta una
de las dos observaciones con escalera completa, el resultado es NULL y se
declara: no se imputa (I12).

CÓMO CAPTURARLA
La escalera solo existe en el sitio de la aerolínea. Probá en este orden y
reportá hasta dónde llegaste:
  1. La URL de la captura tiene un shoppingId: aerolineas.com.ar/flights-offers
     ?adt=1&...&flightType=ONE_WAY&leg=BUE-EQS-20260907&shoppingId=...
     El sitio es una SPA, así que detrás hay una API JSON. Buscala con las
     herramientas de desarrollo. Si es alcanzable, es el camino barato.
  2. Playwright sobre el sitio, reutilizando el navegador ya instalado
     (PLAYWRIGHT_BROWSERS_PATH; nunca `playwright install`, I6). Recordá que
     desde el VPS dio 403 por el WAF: si vuelve a dar, decilo y no insistas más
     de medio día.
  3. Flybondi y JetSMART tienen su propia escalera; empezá por Aerolíneas, que
     es la única que opera EQS.

Esto YA NO ES enriquecimiento opcional. La invariante I9 decía que ningún
indicador crítico podía depender de la sonda Playwright: sigue valiendo para
la disponibilidad de asientos, pero la escalera pasa a ser necesaria para
responder la pregunta central. Cadencia realista: solo EQS y BRC, solo los
próximos 60 días, semanal. Con eso alcanza para separar los dos efectos.

===========================================================================
P0 — LA SERIE TITULAR PASA A SER EL MÍNIMO, NO LA MEDIANA
===========================================================================
La pregunta que define competitividad no es "cuánto sale típicamente" sino
"cuánto es lo más barato que puedo pagar". Cambios:

  · Línea principal del gráfico: precio_min_ars (nuevo en el catálogo).
  · Bandas IQR y mín-máx: APAGADAS por defecto, con toggle para encenderlas.
    Se siguen calculando y guardando: sirven para comparar dispersión entre
    destinos, pero contaminan la lectura cuando la pregunta es el piso.
  · Junto al mínimo, mostrar SIEMPRE vuelos_dia (nuevo en el catálogo). No es
    lo mismo que el mínimo salga de un vuelo único que de tres: con un solo
    vuelo, ese precio ES el mercado entero. Marcador de tamaño variable o una
    micro-barra bajo el punto, lo que quede más limpio.

===========================================================================
P1 — COBERTURA: faltan casi todos los destinos
===========================================================================
En el gráfico diario, Bariloche se corta alrededor del 18/11 y Chapelco aparece
salteado. Y nunca se agregaron los demás. Ahora hay DOS CLASES DE RUTA, con
propósitos distintos (ver clases_de_ruta en rutas_muestreo.json):

  SUPERFICIE COMPLETA — EQS, BRC, CPC desde BUE y COR, ambos sentidos.
    180 días, diario, sin huecos. Son los que se comparan de frente.

  PANEL DE RED — REL, PMY, CRD, USH, FTE, IGR, JUJ, SLA, MDZ desde BUE.
    NO hace falta barrerlos enteros. Para comparar costo por kilómetro alcanza
    un panel BALANCEADO: 7 anticipaciones fijas (7, 14, 30, 60, 90, 120, 180),
    semanal. Son 18 consultas/día para nueve destinos.
    Y es MEJOR estadísticamente que barrerlos: mismas celdas para todas las
    rutas, sin sesgo de cobertura desigual. Comparar una ruta con 180 fechas
    contra otra con 40 no mide tarifa, mide qué fechas tocó cada una.

  Presupuesto total ≈ 1.119 consultas/día. A 10s son 3,1 h de reloj.
  Con el grid de fechas: 24 sentidos x 3 grillas = 72/día. El grid deja de ser
  una optimización y pasa a ser la única forma de que esto entre cómodo.
  Escalonar como en 1e y reportar bloqueos.

===========================================================================
P1 — COTIZACIÓN DIARIA DEL DÓLAR
===========================================================================
Tabla ext_fx_diario, ya en el esquema. Una consulta por día.
  Candidatas a verificar desde el VPS (bloqueadas desde mi entorno):
    https://dolarapi.com/v1/dolares/oficial
    https://dolarapi.com/v1/dolares/blue
    https://api.bluelytics.com.ar/v2/latest
  Elegí una primaria y dejá la otra de respaldo.

LO QUE MÁS IMPORTA ACÁ: se guarda la SERIE, no se consulta al vuelo. Una
observación de septiembre se convierte con el dólar del día en que se observó,
nunca con el de hoy. Si eso no se respeta, la serie histórica en dólares queda
reescrita cada vez que se mueve el tipo de cambio.

Toggle en el tablero: ARS · USD oficial · USD blue. Y dejá previsto un cuarto,
"ARS constante", deflactando por IPC-INDEC con mes base explícito: para
comparar 2026 contra 2028 es el correcto, aunque hoy no haga falta.

Si la fuente falla: conservar el último valor conocido, marcarlo en meta.json,
y NUNCA interpolar (I12).

===========================================================================
P2 — Vista nueva: FICHA DE FECHA
===========================================================================
Elegir UNA fecha de vuelo y ver todo lo que sabemos de ella:
  · La serie completa de observaciones: cómo evolucionó su precio desde que
    empezamos a mirarla. Es el "¿cómo fue este día?" que pidió Leandro.
  · La escalera tarifaria en cada observación, y qué escalones fueron cayendo.
  · Vuelos operados, horarios, aerolínea.
  · La descomposición precio/composición acumulada.
  · Marca del día de hoy sobre la serie.

Hoy tiene una sola observación por fecha y se ve pobre. En tres meses es la
vista más valiosa del sistema, y es la que justifica haber empezado a capturar
ya. Construila simple ahora y dejala crecer.

===========================================================================
CRITERIOS DE ACEPTACIÓN
===========================================================================
  1. Etiqueta corregida: lo que hoy dice "Máximo" dice lo que realmente mide.
  2. Escalera tarifaria capturada para EQS, o reportado con evidencia por qué
     no se pudo y hasta dónde se llegó de los tres caminos.
  3. efecto_precio_pp y efecto_composicion_pp calculados en el ETL, con NULL
     declarado cuando falta la escalera de alguna de las dos observaciones.
  4. Serie titular = precio_min_ars; bandas apagadas por defecto; vuelos_dia
     visible junto al mínimo.
  5. Superficie completa sin huecos para EQS, BRC y CPC en los 180 días.
  6. Panel de red con los 9 destinos y sus 7 anticipaciones.
  7. ext_fx_diario poblándose; conversión con el FX de la fecha de observación,
     verificado con un caso de prueba de una fecha pasada.
  8. Ficha de fecha funcionando aunque sea con pocas observaciones.
  9. Reportado: consultas/día, espaciado, duración, bloqueos.

Las etiquetas y unidades salen de generated/web/indicadores.ts. Los cinco
indicadores nuevos ya están en el catálogo: no inventes nombres paralelos.
```
