# Prompt 1d — Filtro de pertinencia, huecos sin explicar y gobernanza del panel

> La primera noche salió muy bien: 172/172, 95,9% de cobertura, 0 bloqueos, 16,1 s de CPU y 65 MB
> de RSS. Esto son tres cosas puntuales sobre lo que muestra ese resultado.

---

```
Repo: github.com/leanchoi/leanchoi, rama claude/esquel-data-ecosystem-integration-qbxuv2.
`git pull --rebase`: hay cambios en specs/sql/01_air_schema.sql y docs/01-motor-aereos.md.

===========================================================================
P0 — Itinerarios internacionales contaminando la serie de cabotaje
===========================================================================
El desglose de la primera noche trae, sobre rutas de cabotaje patagónico:
  LATAM (LA): 13 itinerarios
  GOL (G3):    4 itinerarios

Ninguna de las dos opera cabotaje argentino. GOL solo conecta aeropuertos
argentinos con sus hubs en Brasil (GRU-BRC estacional de invierno, GRU-USH).
LATAM cerró su filial doméstica en 2020 y vuela a Bariloche desde hubs
internacionales; fue autorizada a cabotaje hace poco pero no lo lanzó.

O sea: son BUE->BRC vía São Paulo o vía Santiago. Desvíos internacionales que
Google ofrece como alternativa y que NO son el mercado que medimos.

17 sobre 900 parece poco. No lo es:
  · Contaminan la mediana de la celda.
  · Pueden ganar el is_cheapest_of_query y quedar como "el precio del mercado".
  · ROMPEN LA NORMALIZACIÓN POR KILÓMETRO, que divide por la distancia geodésica
    directa mientras el itinerario real pasó por Brasil. El indicador de paridad
    —el más importante para la discusión pública— quedaría sobre un absurdo.

Implementá un filtro de pertinencia con estos criterios:
  · Todas las escalas dentro de Argentina.
  · Operador con derechos de cabotaje vigentes (lista en config, versionada).
  · Duración <= 2,5 x la del directo de referencia de esa ruta.
  · Escalas <= 1, salvo rutas sin directo (COR-EQS fuera de temporada): <= 2.

REGISTRALOS IGUAL, no los descartes: itinerario_relevante = false más
motivo_irrelevancia (escala_internacional | duracion_excesiva | escalas_excesivas |
operador_sin_cabotaje). La capa bronce guarda hechos, así el filtro se puede
revisar y re-aplicar sin volver a scrapear.

Y de yapa queda una serie útil: cuántas veces Google ofreció un desvío
internacional en una ruta doméstica es, en sí, un indicador de escasez de oferta.

Recalculá el desglose de la primera noche con el filtro aplicado y reportá cuánto
se movieron la mediana y el mínimo de BUE->BRC. Ese delta es la medida de cuánto
habría contaminado la serie.

===========================================================================
P1 — Los 7 sin_resultados quedaron sin explicar
===========================================================================
Los reportaste como "fechas puente / ventanas específicas sin disponibilidad".
sin_resultados es, por definición, el estado que significa "no sé por qué": es el
único que no puede quedar descrito en general.

Enumerá los 7: ruta, fecha, día de semana, lead, respuesta_valida, tamaño del
blob. Y clasificalos. Sospecho que hay al menos dos causas distintas:
  · Fechas muy lejanas donde la aerolínea todavía no cargó itinerarios. Si es eso,
    merece un estado propio (fuera_de_ventana_de_venta): no es un hueco de captura
    ni una falta de servicio, y no debería descontar cobertura.
  · Vuelos genuinamente agotados. Eso SÍ es un dato valioso —capacidad agotada es
    la señal S3 del monitor— y hoy se está registrando como si fuera un fallo.

Cualquiera de las dos que aparezca, necesita su propio estado. El objetivo es que
sin_resultados tienda a cero: mientras tenga volumen, significa que hay algo que
el sistema no entiende de sí mismo.

===========================================================================
P1 — Gobernanza del panel de consulta (puerto 38530)
===========================================================================
El panel está bien hecho y Leandro lo pidió, así que se queda. Dos cosas:

a) NO TIENE AUTENTICACIÓN y está en un puerto abierto a internet. Esquel Data
   tiene cookie de sesión y roles (permisos.py), y docs/06 §9 define qué ve cada
   rol. Acá quedan expuestos públicamente indicadores de grado C sobre una sola
   celda, que por la invariante I15 no son afirmaciones publicables. Poné al menos
   basic auth o allowlist de IP. No es que el dato sea secreto: es que un
   observatorio público no debería tener dos puertas con reglas distintas.

b) ALCANCE, para que no se convierta en el Frankenstein que el proyecto entero
   quiere evitar. Dividí el panel explícitamente en dos:
   · CONSOLA DE OPERACIÓN (bitácora, canario, disco, calendario de servicio):
     esto es tuyo, es permanente y está bien que viva separado. Nadie más lo va a
     construir y es exactamente lo que hace falta para operar el colector.
   · VISTAS ANALÍTICAS (comparativa patagónica, explorador de vuelos): son un
     preview. Las va a construir F4 dentro de Esquel Data, con el catálogo
     semántico y el cross-filtering de DuckDB-WASM. Ponéles un banner visible que
     diga "vista provisional — la versión definitiva vive en Esquel Data", y que
     lean las etiquetas y unidades desde generated/web/indicadores.ts para que las
     definiciones no puedan divergir. Se retiran cuando F4 aterrice.

===========================================================================
P2 — Verificar el footprint de disco después del arreglo
===========================================================================
Dos números no cierran entre sí:
  · Antes reportaste el crudo en 2.085.158 bytes comprimido; ahora decís que el
    HTML completo pesa ~300 KB. Son un factor de 7 de diferencia.
  · El panel muestra 47,9 MB ocupados. Sobre 172 consultas son 278 KB por
    consulta, sispechosamente parecido a "~300 KB de HTML por consulta". Si el
    blob JSON pesa 3-8 KB, el ocupado debería ser ~1 MB más las 5 fixtures.

Puede ser simplemente que los 47,9 MB incluyan la corrida previa al arreglo. Pero
confirmalo: medí el footprint incremental de UNA noche posterior al cambio y
reportá bytes/consulta reales.

===========================================================================
CRITERIOS DE ACEPTACIÓN
===========================================================================
  1. Ningún itinerario de LA ni G3 entra en los agregados de rutas domésticas,
     y quedan registrados con itinerario_relevante=false y su motivo.
  2. Reportado cuánto se movieron mediana y mínimo de BUE->BRC al aplicar el filtro.
  3. Los 7 sin_resultados enumerados y clasificados; los estados nuevos que hagan
     falta, implementados.
  4. El panel pide credencial o restringe por IP.
  5. Las vistas analíticas del panel llevan banner de provisionalidad y toman
     etiquetas del catálogo generado.
  6. Footprint real de disco por consulta, medido después del arreglo.

Y lo que sigue pendiente de F1a: noches 2 y 3. Reportá el desglose por estado de
cada una.
```
