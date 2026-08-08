# Observatorio de Inteligencia Turística

Tablero de ocupación y demanda para la Subsecretaría de Turismo. Reemplaza el
informe de Looker Studio por una aplicación propia, sin dependencia de servicios
externos, que se despliega como un sitio estático en un VPS.

No es el mismo tablero con otros colores: cambia qué se publica y con qué
respaldo. La diferencia central es que **cada porcentaje lleva encima cuánta
evidencia lo sostiene**.

---

## Por qué se rehízo

Al reconstruir los indicadores desde el dato crudo aparecieron cuatro problemas
que el tablero actual no muestra:

**1. Solo el 29 % de los días tiene una ocupación publicable.**
El Observatorio ya aplica una regla correcta —cada categoría necesita un mínimo
de establecimientos relevados para publicarse— pero el tablero no la comunica.
De 205 días cargados, 60 reúnen las tres categorías mínimas para publicar un
total del destino. El resto aparece hoy como si fuera dato.

**2. Dos categorías nunca se publicaron.**
`CAMPING` y `ALOJAMIENTO DE MONTAÑA` tienen 0 días publicables en todo el
período; `REFUGIOS` tiene uno. En el tablero actual se leen como 0 % de
ocupación, que es una afirmación distinta de "no se midió".

**3. La ocupación por categoría suma porcentajes.**
El gráfico «Total ocupación por categoría» muestra Vivienda Turística en 163 %.
No es un error de escala: es la suma de los porcentajes mensuales. Un día con 3
unidades pesa lo mismo que uno con 3.000. Acá los porcentajes se agregan
ponderando por parque, nunca promediando ni sumando.

**4. La bandera «Relevado» de la planilla subestima la muestra.**
Hay establecimientos marcados `No` que sin embargo tienen ocupación cargada
—por ejemplo *Esquel Apart* el 14/01, con estado «Disponible» y 6 unidades
ocupadas—. Este ETL los cuenta como dato, igual que la hoja oficial, y además
informa cuántos casos son.

El tablero incorpora además una sección de **Calidad del dato** que no existía:
una matriz de 14 categorías × 205 días donde se ve, celda por celda, si hubo
relevamiento, si alcanzó el mínimo y cuántas respuestas faltaron.

---

## Qué hay adentro

Siete secciones, todas atadas a un mismo estado de filtrado: al hacer clic en
una categoría, un día del calendario o un mes, **todo el tablero se recalcula**.

| Sección | Qué responde |
|---|---|
| **Panorama** | Ocupación diaria, calendario anual, ranking de categorías, embudo de capacidad |
| **Estacionalidad** | Dispersión diaria por mes, perfil semanal, quincenas comparadas, efecto real de los fines de semana largos |
| **Categorías y oferta** | Matriz categoría × mes, curva de cada categoría, capacidad habilitada vs. en operación, tamaño vs. desempeño |
| **Demanda y derrame** | Pernoctes medidos y proyectados, turistas, estadía, derrame económico estimado |
| **Calidad del dato** | Cobertura del relevamiento día a día, tasa de respuesta, resultado de la gestión de contacto |
| **Establecimientos** | Padrón completo: quién responde, quién nunca contesta, cuánta capacidad representa |
| **Metodología** | Fórmulas, reglas de publicación y reconciliación contra la planilla |

Alrededor de veinte formas gráficas distintas (serie con tendencia, calendario
de calor, matriz, caja y bigotes, pendiente, mancuerna, dispersión, embudo,
pequeños múltiplos, tira de puntos), cada una elegida por el trabajo que hace
—no por variedad—. Todas tienen tooltip, vista de tabla equivalente y responden
al filtro global.

---

## Arquitectura

```
Google Sheets ─┐
               ├─► ETL (Python) ─► Arrow IPC ─► DuckDB-WASM ─► React + SVG
libro .xlsx ───┘    valida y          ~154 KB     SQL en el     tablero
                    normaliza          gzip       navegador
```

**Sin backend.** El ETL genera un modelo dimensional; el navegador lo consulta
con SQL real vía DuckDB-WASM. El despliegue es una carpeta de archivos
estáticos: nginx y nada más. No hay base de datos que mantener, ni API que se
caiga, ni credenciales en producción.

Decisiones que conviene conocer antes de tocar el código:

- **Arrow IPC en vez de Parquet.** `read_parquet` en DuckDB-WASM descarga una
  extensión desde `extensions.duckdb.org` en tiempo de ejecución. En una red sin
  salida a internet eso deja el tablero en blanco. Arrow IPC lo ingiere el motor
  base. El ETL igual emite Parquet, para analizar los mismos datos desde Python,
  R o la CLI de DuckDB.
- **Todo se calcula desde el grano fecha × categoría**, no desde totales
  pre-agregados. Es más trabajo por consulta, pero es lo que hace que el filtro
  cruzado sea real: al elegir una categoría, el total del destino se recalcula
  para esa categoría en vez de quedar congelado.
- **El ETL se reconcilia contra la planilla en cada corrida** y aborta si la
  divergencia supera el umbral. Un dato roto no llega a producción.
- **Sin librería de gráficos.** SVG con escalas de D3 y un kit propio, para que
  veinte gráficos distintos se lean como un sistema y el tema claro/oscuro se
  defina una sola vez.

---

## Puesta en marcha

```bash
make instalar     # dependencias de Python y Node
make datos        # genera el dataset desde etl/Completo_Ocupacion_2026.xlsx
make dev          # http://localhost:5173
```

Para tomar los datos del Google Sheet publicado en vez del libro local:

```bash
make sheets
```

Otros comandos:

```bash
make test         # tests del ETL + chequeo de tipos del tablero
make build        # compila a web/dist
make docker       # imagen lista para el VPS
make ayuda        # lista todo
```

---

## Estructura

```
etl/                     Transformación (Python)
  build.py               Punto de entrada y reconciliación
  oit/
    sources.py           Lectura de Excel o Google Sheets
    normalize.py         Canonicalización de categorías y estados
    indicadores.py       Metodología oficial de ocupación
    demanda.py           Turistas, pernoctes, estadía, derrame
    calendario.py        Feriados, eventos, temporadas
    emit.py              Arrow IPC + Parquet + meta.json
  config/                *** Se edita acá, no en el código ***
    categorias.json      Categorías, alias y mínimos muestrales
    calendario.json      Feriados, fines de semana largos, temporadas
    parametros.json      Destino, gasto medio, metas de gestión
  tests/                 19 tests, incluida la reconciliación con la planilla

web/                     Tablero (React + TypeScript + Vite)
  src/
    db/                  DuckDB-WASM y fragmentos SQL reutilizables
    state/               Filtrado cruzado
    charts/              Kit de gráficos propio
    secciones/           Las siete secciones
    styles/tokens.css    Paleta y tipografía

deploy/nginx.conf        MIME, compresión, caché y CSP
Dockerfile               ETL + build + nginx en tres etapas
docs/                    Metodología y guía de despliegue
```

### Qué se toca para cada cosa

| Para… | Editar |
|---|---|
| Cambiar el mínimo muestral de una categoría | `etl/config/categorias.json` |
| Cargar los feriados del año siguiente | `etl/config/calendario.json` |
| Ajustar el gasto medio del derrame | `etl/config/parametros.json` |
| Clasificar nuevas anotaciones de «Estado» | `etl/oit/normalize.py` → `REGLAS_ESTADO` |
| Cambiar colores o tipografía | `web/src/styles/tokens.css` |

---

## Actualizar los datos

El flujo pensado para producción es un cron diario en el VPS:

```bash
make actualizar DESTINO=usuario@vps:/var/www/turismo
```

Baja la planilla, regenera el dataset, reconcilia contra la serie oficial,
compila y publica. Si la reconciliación falla, se detiene sin publicar.

---

## Documentación

- [`docs/METODOLOGIA.md`](docs/METODOLOGIA.md) — cómo se calcula cada indicador,
  con las fórmulas y las reglas de publicación.
- [`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md) — instalación en el VPS, con y sin
  Docker, HTTPS y actualización automática.

---

## Notas

El período cargado va del 1 de enero al 30 de julio de 2026: 44.014 registros,
235 establecimientos, 14 categorías. Los feriados están precargados para 2026 y
**deben revisarse cada año** en `etl/config/calendario.json`.

El estimador de derrame económico usa un gasto diario configurable
(`etl/config/parametros.json`). Es un parámetro, no un dato relevado, y el
tablero lo dice cada vez que lo muestra. Conviene reemplazarlo por el valor de
la EVyTH o de un relevamiento propio en cuanto esté disponible.
