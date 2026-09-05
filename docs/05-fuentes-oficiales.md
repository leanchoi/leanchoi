# 05 — Capa 0: fuentes oficiales (ANAC/SIAC y EOH)

Desarrolla el hallazgo H2. Es la incorporación de mayor relación valor/costo de toda la revisión:
resuelve por descarga de archivos lo que el informe original pretendía inferir por scraping, y con
nueve años de historia.

---

## 1. Por qué es una capa aparte y no un detalle

El informe intenta medir saturación aérea con `seats_remaining` ("últimos 3 asientos") e
`is_sold_out`. Dos problemas: son inobservables con el motor primario, y donde aparecen en sitios de
aerolíneas son artefactos de marketing —un contador de escasez—, no inventario real.

El factor de ocupación aéreo verdadero, en cambio, **es un dato público, oficial y gratuito**:

| Fuente | Organismo | Aporta | Grano | Cobertura | Latencia |
|---|---|---|---|---|---|
| **Conectividad Aérea (SIAC)** | ANAC, procesado por la Dir. Nac. de Mercados y Estadística | vuelos, pasajeros, **butacas** por par origen-destino → **factor de ocupación real** | Diario × OD | 2017 → hoy | ~1–3 meses |
| **EOH** | INDEC + Subsecretaría de Turismo | ocupación hotelera oficial, pernoctes, estadía media, tarifa media, por región y localidad | Mensual | 2004 → hoy | ~2 meses |

Publicadas en `datos.yvera.gob.ar` (portal de datos abiertos de turismo) y espejadas en
`datos.gob.ar`, ambas sobre CKAN, con API JSON estándar.

---

## 2. Qué resuelve cada una

### ANAC/SIAC → `air_fact_capacidad_mes`

| Habilita | § de `docs/02` |
|---|---|
| Factor de ocupación aéreo real, sin heurísticas de scraping | 8.2 (señal S3) |
| Butacas reales por ruta — elimina el supuesto sobre configuración de cabina | 4.1, 4.3 |
| Índice de Suficiencia Aérea y cuota estructural $\sigma_{\text{aéreo}}$ | 4.1, 4.2 |
| Componente de capacidad de la descomposición causal | 7, paso 4 |
| **Nueve años de historia** → resuelve el arranque en frío de los modelos | 6, 7 |

Es también la fuente **defendible en una mesa de negociación**: un número de ANAC no se discute; un
número scrapeado sí.

### EOH → `ext_fact_eoh_mes`

| Habilita | § |
|---|---|
| Factor regional común de la descomposición, calculado con dato oficial en vez de solo con el cluster de Métrica | 7, paso 1 |
| Validación cruzada de la ocupación que estima el OIT — control de calidad del propio observatorio | — |
| Serie larga de estadía media, insumo de $\bar N$ en el techo estructural | 4.2 |

---

## 3. División de trabajo con el scraping

> **ANAC = verdad retrospectiva y calibración. Scraping = precio prospectivo y alerta temprana.**

| Dimensión | ANAC/EOH | Scraping |
|---|---|---|
| Precio que paga el turista | ✗ | ✓ |
| Ocupación / pasajeros reales | ✓ | ✗ |
| Historia profunda | ✓ (2017 / 2004) | ✗ (desde el día 1) |
| Latencia | 1–3 meses | Horas |
| Sirve para alerta temprana | ✗ | ✓ |
| Publicable como estadística oficial | ✓ | ✗ (solo como observación de mercado) |

Ninguna sustituye a la otra. Juntas cierran el cuadrante que a cada una le falta, y esa
complementariedad es lo que vuelve creíble al observatorio: **las afirmaciones fuertes se apoyan en
dato oficial; el scraping alimenta la anticipación, y se presenta como lo que es.**

---

## 4. Implementación

Ingesta semanal (los datos se actualizan mensualmente; semanal da margen ante republicaciones), vía
la API CKAN:

```
GET https://datos.yvera.gob.ar/api/3/action/package_show?id=conectividad-aerea
    → lista de recursos con sus URLs de descarga
GET <url_del_recurso>  → CSV
```

Patrón de ingesta:

1. `package_show` para descubrir recursos (no hardcodear URLs de archivo: cambian entre
   republicaciones; el `package_show` es la parte estable).
2. Descargar solo si cambió el hash o la fecha de modificación del recurso.
3. Guardar el CSV crudo en bronce (`bronze/oficial/`), con fecha de descarga.
4. Normalizar a `air_fact_capacidad_mes` y `ext_fact_eoh_mes`, filtrando a los aeropuertos y
   localidades de interés.
5. Registrar en `meta.json` la fecha del último período disponible — **el tablero debe mostrar
   siempre hasta qué mes llega el dato oficial**, porque la latencia de 1–3 meses es una
   característica de la fuente, no una falla.

**Antes de escribir el parser hay que ejecutar F0-4 y F0-5** e inspeccionar los CSV reales. Los
nombres exactos de columna y las convenciones de código de aeropuerto (IATA vs OACI —`EQS` vs
`SAVE`—) deben leerse del archivo, no suponerse. Este entorno de revisión tiene bloqueados los
dominios `.gob.ar` por su proxy de egreso, de modo que la inspección tiene que hacerse desde el VPS.

Punto de atención al mapear: **si los datasets usan código OACI**, hace falta la tabla de
equivalencia. `air_dim_aeropuertos` la incluye
([`specs/config/aeropuertos.csv`](../specs/config/aeropuertos.csv)) con ambos códigos.

---

## 5. Riesgos

| Riesgo | Mitigación |
|---|---|
| Cambio de estructura de los CSV entre publicaciones | Validación de esquema en la ingesta; si falla, conservar el último dato bueno y marcar el dataset en `meta.json`. Nunca abortar el ETL |
| Discontinuidad de la publicación | El sistema sigue funcionando con scraping; se degradan S3 y la descomposición de capacidad, no el resto |
| Desfase entre la ocupación del OIT y la EOH | Es **esperable** —universos y metodologías distintos— y es informativo. Mostrar ambas series, nunca promediarlas |
| Rutas con pocos vuelos y secreto estadístico | Verificar si ANAC suprime celdas de bajo volumen; con 3 frecuencias semanales, Esquel podría estar cerca del umbral. Comprobar en F0-4 |

El último riesgo merece atención en el spike: si ANAC suprime o agrega celdas de bajo volumen,
justamente Esquel podría ser el caso afectado, y hay que saberlo antes de construir sobre esa
fuente.

---

## Fuentes consultadas

- [Datos Abiertos de Turismo — Conectividad Aérea](https://datos.yvera.gob.ar/dataset/conectividad-aerea)
- [Datos Argentina — Conectividad Aérea](https://datos.gob.ar/dataset/turismo-conectividad-aerea)
- [Encuesta de Ocupación Hotelera y Parahotelera (EOH) — Yvera](https://datos.yvera.gob.ar/dataset/encuesta-ocupacion-hotelera-parahotelera-eoh)
- [ANAC — Estadísticas](https://datos.anac.gob.ar/estadisticas/)
- [Bitácora Yvera — Conectividad Aérea](https://bitacora.yvera.tur.ar/posts/2023-05-31-conectividad-area/)
