# Prompt 2 — Panel histórico 2017–2026 (ANAC + OIT + EOH)

> Primer valor real sin scrapear nada. Resuelve el arranque en frío de la parte de
> capacidad del modelo, que de otro modo tardaría doce meses.

---

```
Repo de especificación: github.com/leanchoi/leanchoi, rama
claude/esquel-data-ecosystem-integration-qbxuv2.
Leé AGENTS.md y docs/05-fuentes-oficiales.md y docs/07-conectividad-sostenible.md §3.

OBJETIVO
Construir hist_fact_mes: panel mensual 2017-2026 por destino, cruzando conectividad
oficial (ANAC/SIAC), demanda local (OIT) y contexto regional (EOH). ~1.000 filas.

PASO 1 — Inspección real de las fuentes (NO saltear)
La spec se escribió con los dominios .gob.ar bloqueados. La estructura de los CSV es un
SUPUESTO. Antes de escribir el parser:
  GET https://datos.yvera.gob.ar/api/3/action/package_show?id=conectividad-aerea
  GET https://datos.yvera.gob.ar/api/3/action/package_show?id=encuesta-ocupacion-hotelera-parahotelera-eoh
Descargá los recursos e inspeccioná:
  · nombres exactos de columna
  · ¿códigos IATA (EQS) u OACI (SAVE)? specs/config/aeropuertos.csv tiene ambos
  · granularidad real (diaria o mensual) y período cubierto
  · ¿SE SUPRIMEN CELDAS DE BAJO VOLUMEN? Con 6-9 frecuencias semanales, Esquel puede
    estar cerca del umbral de secreto estadístico. Si se suprime, hay que saberlo AHORA
    porque cambia qué se puede afirmar.
Documentá lo hallado y CORREGÍ docs/05 en el mismo commit.

PASO 2 — Ingesta
  etl/sources_oficiales.py   descarga vía package_show (NUNCA hardcodees URLs de archivo:
                             cambian entre republicaciones; el package_show es lo estable)
  etl/normalize_anac.py      -> ext_anac_mensual
  etl/normalize_eoh.py       -> ext_fact_eoh_mes
  bronze/oficial/            CSV crudo con fecha de descarga, para replay
Descargá solo si cambió el hash o la fecha de modificación del recurso.
Validación de esquema: ante un cambio de estructura, conservá el último dato bueno y
marcá el dataset en meta.json. NUNCA abortes el ETL (I3).

PASO 3 — Panel
hist_fact_mes, grano (mes, destino):
  conectividad   vuelos, butacas, pax_aereos, lf_real            ANAC, desde 2017
  demanda local  ocupacion_oit_pct, pernoctes, estadia_media, derrame   OIT
  contexto       ocupacion_eoh_pct por región                    EOH
  mercado        adr_med_ars, ocupacion_implicita_pct            Métrica (desde su inicio)

PASO 4 — Cinco respuestas inmediatas
Calculá y reportá, con los datos reales:
  1. Perfil mensual de sigma_aereo con butacas REALES (no supuestas). Es un PERFIL, no un
     escalar: Esquel varía ~50% entre base y pico.
  2. Multiplicador pernoctes / pasajero aéreo, y su estabilidad y estacionalidad.
  3. Elasticidad de la ocupación a las butacas ofrecidas: panel con efectos fijos de
     destino y de mes. Con ~100 meses ESTO SÍ ES ESTIMABLE HOY.
  4. Serie de lf_real por ruta contra el piso del 80% del programa de Conectividad
     Sostenible: ¿cuántas veces se habría activado la cláusula históricamente?
  5. Estacionalidad de la demanda aérea de Esquel vs el cluster: ¿el pico de Tulipanes se
     ve en el aire o es tráfico terrestre?

RESTRICCIONES
  · numpy alcanza para todo esto; no incorpores statsmodels ni pandas si el proyecto no
    los usa ya. Intervalos por bootstrap.
  · La ocupación del OIT y la de EOH son universos distintos: mostralas por separado,
    NUNCA promediadas. El desfase es informativo, no un error a corregir.
  · Todo indicador nuevo necesita entrada en specs/catalogo/indicadores.yaml (I11).

CRITERIOS DE ACEPTACIÓN
  1. Series completas de EQS, BRC, CPC, PMY, REL, CRD, USH, FTE desde 2017 con pax,
     butacas y LF.
  2. Descarga vía package_show, sin URLs de archivo hardcodeadas.
  3. Con la fuente caída o su esquema cambiado, el ETL termina en verde y marca el
     dataset.
  4. Las cinco respuestas del paso 4, calculadas y reportadas con sus supuestos.
  5. docs/05 corregido con la estructura real de los CSV.
```
