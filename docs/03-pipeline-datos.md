# 03 — Pipeline de integración: PostgreSQL → Arrow → DuckDB-WASM

Responde el punto 3 del pedido: valida el diseño de exportación y especifica cómo estructurar el
consumo en el navegador. Precondición: H11 y H12 de [`00-revision-critica.md`](00-revision-critica.md).

---

## 1. Veredicto sobre el diseño propuesto

**El eje Arrow IPC → DuckDB-WASM se valida sin reservas.** Es la decisión de mayor valor sostenido
del proyecto: mueve el cómputo analítico al navegador del usuario, elimina el costo de servidor por
consulta y hace posible el cross-filtering instantáneo que el informe pide. No hay alternativa
mejor para este caso.

Se corrigen tres puntos del "cómo":

| Propuesta original | Problema | Corrección |
|---|---|---|
| Vistas materializadas en el PostgreSQL de Métrica | Crea objetos y exige `REFRESH` dentro de Métrica: es el acoplamiento que se quiere evitar. Con 360k filas no hace falta | **Contrato de lectura versionado** en el repo de Esquel Data, con rol de solo lectura. Cero objetos nuevos |
| PostgreSQL propio para el subsistema aéreo | Contenedor y RAM permanentes para 1–3 M filas/año con un escritor y un lector | **Bronce/plata/oro sobre archivos**. Sin contenedor, sin puerto, con replay total |
| TTCI precalculado en el ETL y emitido en `.arrow` | Depende de $N$, $P$ y moneda, que elige el usuario. Precalcularlo multiplica las tablas por cada combinación | **TTCI se calcula en el navegador.** El ETL emite solo los componentes |

---

## 2. Contrato de lectura con Métrica

### 2.1 Principio

Métrica no se modifica. Esquel Data **lee** su PostgreSQL una vez por día con consultas que viven
versionadas en `etl/contracts/metrica/*.sql`. Si Métrica cambia su esquema interno, se rompe una
consulta identificable en un archivo del repo de Esquel Data —no un objeto invisible dentro de otra
base—. El contrato es explícito y auditable en `git log`.

### 2.2 Acceso mínimo necesario

```sql
-- Se ejecuta UNA vez. No crea objetos ni modifica datos de Métrica.
CREATE ROLE esquel_ro LOGIN PASSWORD :'pwd';
GRANT CONNECT ON DATABASE metrica TO esquel_ro;
GRANT USAGE  ON SCHEMA public     TO esquel_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO esquel_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO esquel_ro;
ALTER ROLE esquel_ro SET statement_timeout = '120s';
ALTER ROLE esquel_ro SET idle_in_transaction_session_timeout = '60s';
```

Crear un rol es un cambio a nivel de base, no de la aplicación: no toca tablas, datos, ni el
despliegue del puerto 3013. Es **menos** riesgoso que consultar con las credenciales de la
aplicación, porque hace imposible una escritura accidental. Salvaguardas adicionales:

* `application_name='esquel_data_etl'` en la cadena de conexión → identificable en `pg_stat_activity`.
* Extracción **fuera** de la ventana de scraping de Métrica.
* Reintento único con backoff; si falla, el ETL continúa con la última foto y marca el dataset como
  desactualizado en `meta.json` (nunca aborta — H13-a).

### 2.3 Qué se extrae

Dos consultas, definidas en [`specs/sql/02_metrica_contract.sql`](../specs/sql/02_metrica_contract.sql):

| Consulta | Grano de salida | Filas/año aprox. |
|---|---|---|
| `ota_daily` | destino × noche × tipología | 10 × 365 × 8 ≈ 29.000 |
| `ota_leadtime` | destino × noche × bucket de anticipación | 10 × 365 × 10 ≈ 36.500 |

Ambas son agregaciones sobre ≈360k observaciones: subsegundo en PostgreSQL con los índices
existentes. **Por eso no hacen falta vistas materializadas.** Regla de escalamiento: medir p95
durante 30 días; solo si supera 10 s se evalúa materializar — y en ese caso, del lado de Esquel
Data (una tabla DuckDB local), no dentro de Métrica.

---

## 3. Almacenamiento del subsistema aéreo: bronce / plata / oro

```
/var/lib/metrica-aereos/
├── bronze/
│   ├── obs/observed_date=2026-09-05/run_20260905T0300Z.jsonl.gz    ← inmutable, permanente
│   └── html/observed_date=2026-09-05/*.html.gz                     ← rotación 14 días + fixtures
├── silver/
│   └── air_observations/observed_date=2026-09-05/part-0.parquet    ← permanente
└── runs/
    └── air_scrape_runs.parquet                                     ← bitácora de cobertura
```

Por qué este patrón y no una base:

* **Replay total.** Si se descubre un bug de parser, se reprocesa bronce → plata sin volver a
  scrapear. En un subsistema cuya fuente es HTML frágil (H5), esto no es un lujo: es la única
  garantía de que un error no destruye el histórico.
* **Sin concurrencia.** Un escritor nocturno, un lector nocturno. Ninguna base aporta nada aquí.
* **Cero infraestructura.** Ni contenedor, ni puerto, ni backup adicional: entra en el backup de
  archivos que ya exista.
* **Lectura trivial desde el ETL:** `duckdb.sql("SELECT * FROM 'silver/air_observations/**/*.parquet'")`.

El DDL de [`specs/sql/01_air_schema.sql`](../specs/sql/01_air_schema.sql) define el **contrato
lógico** de la capa plata (tipos, claves, restricciones). Se materializa como Parquet; queda listo
para instanciarse en PostgreSQL el día que aparezca un consumidor server-side que lo justifique.

---

## 4. Tablas oro emitidas para el tablero

Nomenclatura con prefijos, para que ninguna tabla nueva pueda colisionar con las 24 existentes:
`air_*` (aéreo), `ota_*` (mercado Métrica), `x_*` (cruces).

| Tabla | Grano | Filas est. | Carga |
|---|---|---|---|
| `air_dim_aeropuertos` | aeropuerto | ~30 | Eager |
| `air_dim_rutas` | ruta | ~30 | Eager |
| `air_fact_leadtime` | ruta × fecha vuelo × bucket $\ell$ | ≈117.000 | **Lazy** (sección Aéreos) |
| `air_fact_capacidad_mes` | ruta × mes (ANAC: pax, butacas, LF) | ≈1.700 | Eager |
| `ota_fact_dia` | destino × noche × tipología | ≈29.000 | Lazy (sección Mercado) |
| `ota_fact_leadtime` | destino × noche × bucket $\ell$ | ≈36.500 | Lazy (sección Mercado) |
| `x_fact_correlacion_dia` | fecha × destino (3 focales) | ≈2.200 | Eager |
| `x_fact_descomposicion_mes` | mes × componente | ≈700 | Eager |
| `x_fact_alertas` | destino × semana objetivo × corrida (90 d) | ≈3.000 | Eager |

**Regla de diseño que evita el error más caro:** *nunca cruzar la dimensión de tipología con la de
anticipación*. El producto `10 destinos × 730 noches × 10 buckets × 5 tipologías` = 365.000 filas y
~4 MB comprimidos, para responder preguntas que nadie hace. Dos tablas separadas suman 65.000 filas
y menos de 1 MB. Cuando una tabla oro crezca, la solución es **quitar una dimensión**, no comprimir
más.

---

## 5. Presupuesto de bytes

Es el control que evita la pantalla en blanco que el informe menciona en su matriz de riesgos.

**Aritmética de `air_fact_leadtime`**, la tabla más grande:

```
16 rutas × 730 fechas de vuelo (24 meses móviles) × 10 buckets = 116.800 filas
Columnas: 3 claves dict/date (~6 B) + 9 métricas float32 (36 B) ≈ 42 B/fila
Crudo:      116.800 × 42 ≈ 4,9 MB
Parquet ZSTD o Arrow servido con brotli ≈ 1,2 – 1,8 MB   ✓ dentro de presupuesto
```

| Presupuesto | Límite | Acción al excederlo |
|---|---|---|
| Por tabla | **2 MB** transferidos | Quitar una dimensión, o recortar la ventana temporal |
| Carga inicial (eager) | **3 MB** total | Mover tablas a lazy |
| Por sección (lazy) | **2,5 MB** | Dividir la sección |
| Memoria del navegador | **~150 MB** | Revisar tipos: `float32` en vez de `float64`, `DATE` en vez de `VARCHAR` |

**Compresión: no usar la interna de Arrow IPC.** El soporte de LZ4/ZSTD dentro del IPC es desparejo
entre implementaciones y es una trampa de compatibilidad conocida. Dos caminos, ambos sólidos:

1. **Arrow IPC sin comprimir + compresión HTTP** (`Content-Encoding: br` o `gzip` desde FastAPI).
   Datos numéricos columnares comprimen muy bien con brotli. Es el camino de menor cambio, porque
   preserva el mecanismo de carga que Esquel Data ya tiene funcionando.
2. **Parquet con ZSTD interno** para las tablas grandes y lazy. DuckDB-WASM lo lee nativamente y el
   ETL ya emite Parquet junto a Arrow. Ventaja adicional: admite *range requests* si alguna tabla
   creciera más allá del presupuesto.

Recomendación: **(1) para las tablas eager —no tocar lo que funciona— y (2) para las lazy grandes.**

---

## 6. Consumo en DuckDB-WASM: cómo mantener los milisegundos

### 6.1 Tipos y orden físico (se decide en el ETL, no en el navegador)

| Regla | Por qué |
|---|---|
| Fechas como `DATE`, nunca `VARCHAR` | Comparación entera vs. comparación de strings; además habilita poda por zone map |
| Códigos como diccionario Arrow → `ENUM` en DuckDB | `destino = 'EQS'` pasa a ser comparación de un entero pequeño |
| Métricas en `float32` salvo que se necesite precisión | Mitad de bytes en red y en memoria |
| **Emitir físicamente ordenado por `(destino, fecha)`** | DuckDB guarda min/max por row group: un filtro de rango saltea grupos enteros sin leerlos. Es la optimización de mayor impacto y cuesta un `ORDER BY` en el ETL |
| Precalcular el bucket $\ell$ en el ETL | Evita `CASE WHEN` sobre millones de filas en cada interacción |

### 6.2 Patrón de consulta

Los ejemplos completos están en
[`specs/sql/03_duckdb_wasm_patterns.sql`](../specs/sql/03_duckdb_wasm_patterns.sql). Las reglas:

**a) Una consulta por gráfico, parametrizada, con sentencia preparada.** Nunca concatenar filtros en
strings: se pierde el plan cacheado y se abre la puerta a inyección desde el estado de la UI.

**b) Devolver siempre agregados, nunca filas crudas.** El costo dominante no es el escaneo en WASM,
es la materialización a objetos JavaScript. Una consulta que devuelve 200 filas es instantánea
aunque escanee 100.000; una que devuelve 50.000 filas congela la interfaz aunque escanee lo mismo.

**c) Pivotear en SQL, no en JavaScript.** Agregación condicional dentro de DuckDB:

```sql
SELECT lead_bucket,
       median(fare_ars) FILTER (WHERE destino = 'EQS') AS eqs,
       median(fare_ars) FILTER (WHERE destino = 'BRC') AS brc
FROM air_fact_leadtime
WHERE flight_date = $1 AND origen = $2
GROUP BY lead_bucket ORDER BY lead_bucket;
```

**d) Sin joins en caliente entre tablas grandes.** Desnormalizar en el ETL. Los joins solo contra
tablas de dimensión (decenas de filas), que DuckDB resuelve con hash build trivial.

**e) Debounce y cancelación por contador de generación.** Los sliders disparan decenas de eventos
por segundo:

```ts
let gen = 0;
async function refrescar(filtros: Filtros) {
  const mine = ++gen;
  const res = await stmt.query(...paramsDe(filtros));
  if (mine !== gen) return;          // llegó una consulta más nueva: descartar ésta
  render(res);
}
```
Con debounce de ~120 ms sobre el estado de `state/filtros.ts` y una única conexión secuencial.

**f) Carga perezosa por sección.** Las tablas de aéreos no se descargan hasta que el usuario abre la
pestaña. Mantiene el arranque en frío por debajo del presupuesto eager de 3 MB.

**g) Multithreading (opcional).** DuckDB-WASM usa varios hilos solo con aislamiento de origen
cruzado (`Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`).
Se agrega en FastAPI. **Advertencia:** COEP rompe la carga de recursos de terceros sin CORP —
iframes, fuentes o imágenes externas—. Con tablas dentro del presupuesto de bytes, la ganancia es
marginal. **Recomendación: no activarlo en la fase inicial.** Es una optimización disponible si
alguna vista concreta lo pide, no un requisito.

### 6.3 El TTCI se calcula en el navegador

Es el motivo por el que el usuario puede mover "noches" y "pasajeros" y ver el resultado al
instante. El ETL emite solo los componentes; la combinación es una expresión aritmética sobre pocas
filas:

```sql
-- $1 noches, $2 pasajeros, $3 ocupación por unidad, $4 fecha, $5 origen
WITH p AS (SELECT $1::INT n, $2::INT pax, CEIL($2::DOUBLE / $3) unidades)
SELECT a.destino,
       p.pax * a.fare_rt_median                                AS comp_aereo,
       a.transfer_cost_group                                   AS comp_traslado,
       p.n * p.unidades * o.adr_median                         AS comp_alojamiento,
       p.pax * a.fare_rt_median + a.transfer_cost_group
             + p.n * p.unidades * o.adr_median                 AS ttci,
       (p.pax * a.fare_rt_median + a.transfer_cost_group
             + p.n * p.unidades * o.adr_median) / (p.pax * p.n) AS ttci_pppn
FROM air_gateway_costs a
JOIN ota_fact_dia      o ON o.destino = a.destino AND o.fecha = a.flight_date
CROSS JOIN p
WHERE a.flight_date = $4 AND a.origen = $5;
```

Cruza decenas de filas. Se ejecuta en cada movimiento del slider sin latencia perceptible. Si el
TTCI se hubiera precalculado en el ETL, cada combinación de $N \times P \times c \times$ moneda
sería una tabla distinta.

---

## 7. Metadatos, disponibilidad y degradación

`meta.json` se extiende con estado por dataset. Es lo que impide que la falla de un scraper produzca
una pantalla en blanco (H13-a):

```json
{
  "generado": "2026-09-05T06:12:00Z",
  "datasets": {
    "air_fact_leadtime": {
      "disponible": true,
      "filas": 116800,
      "actualizado": "2026-09-05T05:58:00Z",
      "cobertura_7d": 0.94,
      "schema_version": 1,
      "advertencias": []
    },
    "ota_fact_leadtime": {
      "disponible": false,
      "motivo": "timeout de conexión con Métrica",
      "ultimo_ok": "2026-09-04T05:51:00Z",
      "schema_version": 1
    }
  }
}
```

Contrato del frontend, en tres reglas:

1. Antes de cargar un `.arrow`, consultar `meta.json`. Si `disponible: false`, la sección muestra su
   estado y la fecha del último dato bueno. **Nunca** una pantalla en blanco ni un error de consola.
2. Si `cobertura_7d < 0,80`, las series se marcan visualmente como preliminares.
3. Si `schema_version` no coincide con la esperada por el cliente, la sección se deshabilita con un
   aviso de "actualizá la página". Esto convierte un desajuste de despliegue en un mensaje, no en un
   crash.

Y en el ETL: `try/except` por tabla. Una tabla que falla se marca no disponible y **el build
continúa**. Las 24 tablas preexistentes nunca deben verse afectadas por un problema en las nuevas.

---

## 8. Flujo diario completo

```
02:00  Colector aéreo (systemd timer, sin navegador)
       ├─ preflight: memoria y procesos Chromium
       ├─ ~160 consultas espaciadas, tope 250
       ├─ bronce JSONL.gz + bitácora en air_scrape_runs
       └─ canario de parseo → alerta si el rendimiento cae >30%

03:30  Compactación bronce → plata (Parquet por observed_date)

04:00  [semanal] Ingesta de fuentes oficiales: ANAC/SIAC + EOH

05:00  ETL de Esquel Data (etl/build.py)
       ├─ Google Sheets / Excel del OIT      → 24 tablas existentes  [SIN CAMBIOS]
       ├─ Contrato de lectura de Métrica     → ota_*                 [try/except]
       ├─ Parquet plata de aéreos            → air_*                 [try/except]
       ├─ Modelos: TTCI comp., IFPE, N*, paridad, descomposición, IAT → x_*
       └─ emit.py: valida esquemas, ordena físicamente, escribe .arrow/.parquet + meta.json

06:00  Tablero sirve los nuevos archivos. Sin reinicio, sin migración, sin downtime.
```

El punto que hay que preservar en la implementación: las tres flechas hacia `air_*`, `ota_*` y `x_*`
son **independientes entre sí y de las 24 tablas existentes**. Cualquiera puede fallar sin arrastrar
a las demás.
