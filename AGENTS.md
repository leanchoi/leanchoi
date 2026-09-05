# AGENTS.md — Reglas para agentes que implementan Esquel DATA 360°

Archivo de reglas durables. Léelo completo antes de cualquier tarea y vuelve a él ante
cada duda de alcance. Los prompts de tarea están en [`prompts/`](prompts/).

---

## 1. Qué estás construyendo

Integrar en **Esquel DATA** (`/root/apps/tourism-intelligence-dashboard`, puerto 38520,
React + Vite + DuckDB-WASM + FastAPI) los datos de **MÉTRICA**
(`/root/scraper/metrica`, puerto 3013, FastAPI + PostgreSQL) y un subsistema nuevo de
monitoreo de tarifas aéreas, con modelos de correlación entre demanda real, mercado OTA
y conectividad aérea.

La especificación completa está en este repo (`docs/` y `specs/`). **No es una
sugerencia: es el diseño acordado.** Tu trabajo es implementarlo, no rediseñarlo.

---

## 2. Antes de escribir una línea

1. Leé [`docs/00-revision-critica.md`](docs/00-revision-critica.md) — los 13 hallazgos que
   explican por qué el diseño es como es. Sin esto vas a "corregir" cosas que están
   deliberadamente así.
2. Leé el prompt de tu tarea en [`prompts/`](prompts/).
3. Leé la sección 4 de este archivo (invariantes) y la 6 (decisiones cerradas).
4. **Verificá los supuestos de la sección 5 contra el sistema real antes de codear.**

---

## 3. Cómo trabajar

* **Una tarea por vez, hasta sus criterios de aceptación.** No adelantes trabajo de la
  fase siguiente: el plan está desacoplado a propósito para que cada pieza entre a
  producción sola.
* **Verificá contra el sistema real, no contra la spec.** Los nombres de tabla de Métrica
  y la estructura de los CSV de ANAC en las specs son **supuestos declarados**. Si el
  real difiere, gana el real: adaptá el código y **corregí la spec en el mismo commit**.
* **Si algo de la spec está mal, decilo y seguí.** Implementá bajo el supuesto que
  consideres correcto, dejalo explícito en el commit y en un comentario. No te bloquees
  esperando confirmación salvo que sea destructivo o irreversible.
* **Nada de mocks silenciosos.** Si una fuente no está disponible, el sistema lo declara
  (`disponible: false` en `meta.json`). Nunca inventes datos de relleno "para probar la
  UI" sin marcarlos de forma inequívoca y removerlos antes del commit.
* **Commits chicos y verificables**, en español, describiendo el porqué y no solo el qué.

---

## 4. Invariantes — violar una es motivo de rechazo

| # | Invariante |
|---|---|
| **I1** | **Métrica no se modifica.** Ni su código, contenedores, `docker-compose`, scheduler ni puerto 3013. Única interacción: `SELECT` con rol de solo lectura |
| **I2** | **Las 24 tablas existentes de Esquel Data son intocables**: mismos nombres, columnas y tipos. Lo nuevo lleva prefijo `air_`, `ota_`, `x_`, `ext_` |
| **I3** | **El ETL nunca aborta por un dataset nuevo.** `try/except` por tabla; una falla marca `disponible: false` y el build sigue |
| **I4** | **El frontend nunca rompe por un dataset ausente.** Consultar `meta.json` antes de cargar. Prohibida la pantalla en blanco |
| **I5** | **Sin contenedores ni puertos nuevos.** El subsistema aéreo es un timer de systemd más archivos |
| **I6** | **Sin descargas de navegador.** Playwright reutiliza el runtime instalado vía `PLAYWRIGHT_BROWSERS_PATH`. Nunca `playwright install` |
| **I7** | **Todo componente nuevo es eliminable.** Borrar sus archivos devuelve el sistema al estado previo, sin migraciones inversas |
| **I8** | **Toda serie publicada declara su cobertura.** Bajo 80% se marca preliminar. Sin dato, se dice |
| **I9** | **Ningún indicador crítico depende de la sonda Playwright.** Es enriquecimiento opcional |
| **I10** | **Cada fase entra a producción sola.** Nada queda a medias esperando la siguiente |
| **I11** | **Toda columna de una tabla oro tiene entrada en `specs/catalogo/indicadores.yaml`.** `validar_columnas()` aborta la emisión si no |
| **I12** | **Nunca interpolar ni rellenar huecos de captura.** Un hueco es un dato: significa "no se pudo medir", que no es lo mismo que "no había vuelo" |
| **I13** | **Nunca mostrar verde sin medición.** Cobertura insuficiente ⇒ estado "sin señal" |
| **I14** | **La lógica de diagnóstico vive en `insights.yaml`, no en componentes React.** El frontend renderiza tarjetas; no decide qué significa un número |
| **I15** | **Ninguna afirmación pública se apoya en una celda única.** Una observación suelta es grado C hasta tener la celda completa (ruta × bucket de anticipación × día de semana × temporada) con cobertura suficiente. Vale también —y sobre todo— cuando el número confirma lo que esperábamos |

---

## 5. Lo que NO está verificado — verificalo primero

La spec se escribió sin acceso al VPS y con los dominios `.gob.ar` bloqueados. Estos
puntos son **supuestos explícitos**:

### Ya verificado (spike F0, corrida real en el VPS)

| Supuesto | Resultado | Consecuencia |
|---|---|---|
| Google Flights lista Flybondi y JetSMART | ✅ **Confirmado** — 18 itinerarios en BUE→BRC con los tres operadores | El motor primario sigue como está. No hace falta scraping complementario de `flybondi.com` |
| La IP del VPS tolera el ritmo de captura | ✅ **Confirmado** — 30 consultas espaciadas 15–45 s: 29 ok, 1 vacía, 0 bloqueos, 63 MB RSS | El presupuesto de ~160 consultas/día con tope 250 es válido |
| Formato de respuesta y API de `fast-flights` | ⚠️ **Corregido** — v3.1.0 usa `create_query(flights=[FlightQuery(...)])` y devuelve **arrays JSON anidados**, no HTML. Su parser nativo **rompe con Flybondi** (`IndexError`: el precio está en `k[0][2][0][31]` y no en `k[1][0][1]`) | Refuerza la decisión de vendorizar el parser, y **obliga a que el canario cuente itinerarios por aerolínea**, no en total (ver abajo) |

### Todavía sin verificar

| Supuesto | Dónde | Cómo verificar |
|---|---|---|
| Nombres de tabla de Métrica (`price_observations`, `listings`, `destinations`, `fx_daily`) | `specs/sql/02_metrica_contract.sql` | `information_schema.tables` con el rol de lectura (F0-6) |
| Estructura de los CSV de ANAC: columnas, IATA vs OACI, supresión de celdas de bajo volumen | `docs/05` | Descargar vía CKAN `package_show` e inspeccionar (F0-4) |
| Coordenadas de aeropuertos | `specs/config/aeropuertos.csv` | Contrastar con OurAirports antes de publicar cualquier tarifa/km |
| Butacas por equipo (≈96 en E190) | varios | **No asumir**: ANAC publica butacas reales |
| Nombres de componentes y rutas del frontend | `docs/04` F4 | Leer `web/src/App.tsx` |

> **La lección del bug de Flybondi, que vale para todo el proyecto.** El parser no devolvía datos
> incompletos: crasheaba. Tuvimos suerte. Si en lugar de un `IndexError` hubiera devuelto la lista
> sin Flybondi, habríamos medido solo Aerolíneas durante meses, concluido que Bariloche es más caro
> de lo que es, y subestimado la brecha — sin ninguna señal de que algo andaba mal. **De ahí sale
> la regla del canario por aerolínea:** un contador de itinerarios totales no habría detectado
> nada, porque los otros dos operadores compensan el faltante.

Si un supuesto resulta falso: **corregí la spec en el mismo commit que el código.** La
spec desactualizada es peor que no tenerla.

---

## 6. Decisiones cerradas — no reabrir

Estas se discutieron y se cerraron con fundamento en `docs/00`. Si creés que alguna está
mal, decilo en el commit, pero **no la cambies unilateralmente**:

* **Arrow IPC + DuckDB-WASM con cómputo en el cliente.** Validado. No migrar a consultas
  de servidor.
* **Sin PostgreSQL para el subsistema aéreo.** Bronce JSONL.gz → plata Parquet → oro
  Arrow. `specs/sql/01_air_schema.sql` es el contrato lógico, no un DDL a ejecutar.
* **Sin vistas materializadas dentro de Métrica.** Contrato SQL versionado en el repo de
  Esquel Data, ejecutado con rol de solo lectura.
* **Amadeus Self-Service y Duffel están descartados.** El primero excluye low-cost y
  sesga la comparación en la dirección que invalida la tesis; el segundo exige acuerdos de
  distribución. El fallback es SerpApi, que mide el mismo universo.
* **Playwright contra `aerolineas.com.ar` no es el fallback general**, solo sonda semanal
  de ≤20 consultas para familias tarifarias.
* **El TTCI se calcula en el navegador**, no en el ETL: depende de parámetros del usuario.
* **σ_aéreo es un perfil mensual, nunca un escalar.**
* **Sin dictámenes causales categóricos.** Descomposición aditiva con residuo explícito y
  gates de suficiencia.
* **Comparaciones siempre dentro de celda** (ruta × bucket de anticipación × día de semana
  × temporada). Comparar a distinta anticipación mide el paso del tiempo, no
  competitividad.

---

## 7. Convenciones

**Nomenclatura** (validada por `gen_catalogo.py`):

```
sufijo de unidad:      _ars _usd _pct _ratio _idx _dias _pp _pernoctes _plazas
sufijo de agregación:  _med _p25 _p75 _min _max _sum
prefijo de tabla:      air_  ota_  x_  ext_
fechas:                fecha · flight_date · observed_date · lead_dias · lead_bucket
```

**Idioma.** El proyecto está en español (`oit_api`, `permisos.py`, `etl/build.py`,
`state/filtros.ts`). Mantené español en nombres de dominio y comentarios. Donde el código
existente ya usa inglés, seguí el código existente — la coherencia local gana.

**Estilo.** Igualá la densidad de comentarios, los nombres y los modismos del archivo que
estés tocando. No introduzcas un framework, un linter ni un formateador nuevos.

---

## 8. Definición de terminado — aplica a toda tarea

Antes de decir que algo está listo:

1. `python3 specs/scripts/gen_catalogo.py --check` en verde.
2. Si tocaste el ETL: **las 24 tablas preexistentes salen byte-idénticas.** Verificalo con
   `sha256sum` sobre una corrida previa y otra posterior. Es el criterio más importante.
3. Los tests que ya existían siguen pasando.
4. Los criterios de aceptación específicos del prompt de la tarea, uno por uno.
5. Probaste el camino de falla: simulá que la fuente no está y verificá que el ETL termina
   en verde y el frontend degrada con un mensaje.
6. Documentaste en el commit qué supuesto verificaste y cuál corregiste.

**No reportes una tarea como terminada con criterios pendientes.** Si algo quedó afuera,
decí explícitamente qué y por qué.
