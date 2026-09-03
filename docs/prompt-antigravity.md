# PROMPT PARA ANTIGRAVITY — Media Abrojal v5

---

## CONTEXTO

Trabajás sobre **Media Abrojal**, plataforma de inteligencia de medios sobre
Esquel y la Comarca Andina del Chubut. Vive en `/opt/red43_allsite` en el VPS,
sirve en el puerto 8943, y su repositorio es `leanchoi/media-abrojal` (privado).

Ya existe una rama con trabajo hecho, testeado y documentado:

```bash
cd /opt/red43_allsite
git fetch origin
git checkout claude/taxonomia-v4
```

**Esa rama trae 9 módulos nuevos con 63 tests que pasan.** No los reescribas:
usalos. Tu tarea es integrarlos, corregir lo que sigue roto y construir la
interfaz.

### Restricción que no se toca

El VPS está conectado al **plan gratuito de Gemini Lite**. No lo cambies, no
propongas cambiarlo, no agregues otro proveedor. Todo el diseño ya está pensado
para funcionar con esa cuota.

---

## QUÉ HAY EN LA RAMA Y PARA QUÉ SIRVE

### Motor analítico (usalo tal cual, tiene tests)

| Archivo | Qué hace |
|---|---|
| `app/core/metrics.py` | Las 4 métricas de opinión: resonancia, saldo, controversia, pulso. Reemplaza el ranking por `positivas − negativas`. |
| `app/core/taxonomy.py` | Clasificador multi-etiqueta con límites de palabra. Reemplaza la cascada de `enrichment_worker.py`. |
| `app/core/issues_esquel.py` | 17 conflictos locales (Ley 5001, ATECH, La Hoya, rutas, incendios…) + macro-ejes. |
| `app/core/actores.py` | Detección y desambiguación de actores, índice de favorabilidad. |
| `app/core/cooccurrence.py` | Grafo de co-ocurrencia (PMI) y correlación con desfasaje temporal. |
| `app/core/clasificador_llm.py` | Escalón de modelo con cuota limitada. **Diseñado para el plan gratuito.** |

### Herramientas de línea de comandos

| Archivo | Qué hace |
|---|---|
| `app/cli/evaluar_taxonomia.py` | Mide la clasificación contra `section_visible` (la sección que puso un editor humano). Da precisión y recall por tema. |
| `app/cli/reindexar_v4.py` | Re-indexa paginando y con UPSERT. |

### Esquema

| Archivo | Qué hace |
|---|---|
| `sql/migracion_v4_taxonomia.sql` | Columnas multi-etiqueta, género, trazabilidad. |
| `sql/migracion_v5_inteligencia.sql` | Macro-eje, issues, métricas materializadas, tablas de actores, co-ocurrencia, telemetría. |

Ambas son **aditivas**: no borran ni renombran nada. `bucket_inicial` se sigue
escribiendo con el vocabulario viejo, así que el dashboard actual no se rompe.

### Documentación (leela antes de empezar)

| Archivo | Contenido |
|---|---|
| `docs/arquitectura/00-respuesta-al-brief.md` | Las decisiones y por qué. Fórmulas explicadas. |
| `docs/arquitectura/01-interfaz.md` | Especificación completa de UI: 6 tableros, sistema de diseño, colores exactos, tipografía. |
| `docs/arquitectura/02-plan-implementacion.md` | El plan por fases con criterios de aceptación. |

### Prototipo visual

**https://claude.ai/code/artifact/f6cd7a78-e2b5-4fe3-adc2-6b9bb4fa576e**

Es el Tablero 1 funcionando: mapa de opinión con hover, tooltips ⓘ, presets
cronológicos, modo claro/oscuro. **Es la referencia visual.** Abrilo, miralo, y
replicá esa dirección estética. No inventes otra.

---

## FASE 0 — SEGURIDAD (HACÉ ESTO PRIMERO)

Hay una vulnerabilidad activa. En `app/server/auth.py`:

```python
SECRET_KEY = "red43_vps_super_secret_jwt_key_2026_safe"
```

Con esa clave **cualquiera firma un token JWT válido y entra como admin sin
conocer la contraseña**. La clave ya circuló fuera del servidor. Cambiar la
contraseña NO sirve mientras la clave siga siendo esa.

Tareas:

1. Generar clave nueva: `python3 -c "import secrets; print(secrets.token_urlsafe(64))"`
2. Guardarla en `.env`. Leerla con `os.environ["SECRET_KEY"]`.
   **Que la aplicación falle al arrancar si no está definida.** Nunca un valor
   por defecto en el código.
3. Contraseña de admin nueva. Eliminar la creación automática del usuario por
   defecto en `app/server/main.py`, o forzar cambio en el primer ingreso.
4. Hay un **segundo uvicorn escuchando en `0.0.0.0:8000`** (`app.main:app`,
   corriendo desde el 30 de junio, no documentado en ningún lado). Averiguá qué
   es. Si no se usa, apagalo. Si se usa, ponele autenticación y sacalo de
   `0.0.0.0`.
5. TLS: hoy las credenciales viajan en texto plano sobre HTTP. Poné Caddy o
   nginx con Let's Encrypt delante del 8943, y dejá el puerto de la app sólo en
   `127.0.0.1`.
6. Verificá que `.env` nunca estuvo trackeado: `git log --all -- .env`

**Criterio de aceptación:** un JWT firmado con la clave vieja es rechazado; el
puerto 8000 no responde desde afuera; `https://` funciona.

---

## FASE 1 — MEDIR ANTES DE TOCAR

**No saltees esta fase.** Sin línea de base no se puede demostrar que algo
mejoró, y ese fue exactamente el problema del despliegue anterior: se declaró
"cero errores de clasificación" sin ninguna medición.

```bash
# 1. Ver qué secciones tiene el sitio y cuáles no están mapeadas
python3 app/cli/evaluar_taxonomia.py --db masters/red43_allsite.sqlite --solo-secciones
```

Eso lista las secciones reales con su mapeo. **Ampliá el diccionario
`SECCION_A_TEMA`** dentro de `app/cli/evaluar_taxonomia.py` con las que
aparezcan como "sin mapear".

```bash
# 2. Medir el clasificador actual contra la sección del editor humano
python3 app/cli/evaluar_taxonomia.py --db masters/red43_allsite.sqlite \
    --limite 20000 --salida docs/diagnostico/evaluacion-base.md

git add docs/diagnostico/evaluacion-base.md && git commit -m "Línea de base de clasificación"
```

**Criterio de aceptación:** existe `evaluacion-base.md`, con precisión, recall y
F1 por tema, matriz de confusión, y al menos 10.000 notas evaluadas.

---

## FASE 2 — MIGRAR Y RE-INDEXAR

```bash
# Respaldo obligatorio
cp masters/red43_allsite_enriched_v1.sqlite masters/red43_allsite_enriched_v1.sqlite.bak

sqlite3 masters/red43_allsite_enriched_v1.sqlite < sql/migracion_v4_taxonomia.sql
sqlite3 masters/red43_allsite_enriched_v1.sqlite < sql/migracion_v5_inteligencia.sql

# Simulacro: muestra la distribución sin escribir nada
python3 app/cli/reindexar_v4.py --simulacro

# Escritura real
python3 app/cli/reindexar_v4.py
```

Después, tareas de integración que tenés que escribir vos:

1. **Poblar las columnas denormalizadas** de `enriched_articles` desde
   `raw_articles`: `fecha_publicacion`, `titulo`, `reacciones_pos`,
   `reacciones_neg`, `reacciones_disponibles`.
   Están en otra base y todo filtro cronológico las necesita; el ATTACH + JOIN
   en cada request es el cuello de botella del explorador.

2. **Calcular `k`** con `estimar_k()` de `app/core/metrics.py` sobre las notas
   que tienen reacciones, y guardarlo en la tabla `parametros`.

3. **Calcular las columnas `m_*`** (resonancia, saldo, controversia, pulso,
   apoyo_inf, rechazo_inf, clima) para todas las notas usando
   `app/core/metrics.py`. Se materializan porque el dashboard ordena por ellas.

4. **Poblar `menciones` y `actores`** usando `app/core/actores.py`.

5. **Correr `candidatos_a_actor()`** sobre el corpus y guardar la lista de
   candidatos en un archivo para revisión humana. **No los agregues
   automáticamente al registro**: un actor mal cargado envenena su serie en
   silencio.

6. **Re-evaluar** con el mismo comando de la fase 1, salida
   `docs/diagnostico/evaluacion-v5.md`, y comparar contra la base.

**Criterios de aceptación:**
- La precisión global sube respecto de `evaluacion-base.md`.
- `turismo` recupera cobertura razonable. Hoy tiene 1,59% del total, que es
  implausible para Esquel.
- No queda ningún valor de `grupo_principal` con menos de 100 notas
  proveniente del vocabulario viejo (hoy hay 14 valores así: `cultura` con 9,
  `economia_laboral` con 2, etc.).

---

## FASE 3 — ARREGLAR EL WORKER CONTINUO

Además del crash ya corregido, quedan tres defectos:

| # | Problema | Qué hacer |
|---|---|---|
| 1 | `sitemap_limit=2` sobre **422 sitemaps**, siempre desde `offset 0`. El backfill histórico nunca avanza. | Guardar el offset en `parametros` y rotarlo. O separar en dos modos: "novedades" (offset 0) y "backfill" (offset que avanza). |
| 2 | 20 notas por ciclo de 900 s ≈ 1.920/día de techo. El 2 de agosto estaba extrayendo notas del 25 de julio: una semana de atraso. | Subir el lote hasta consumir el atraso, después bajarlo. |
| 3 | `_fetch_pending` no filtra por estado. Una nota que falla el enriquecimiento se re-consulta para siempre y ocupa lugar del lote. | Excluir las que tienen `enrichment_status='failed'` con más de N reintentos. |

Y algo importante: `main_loop` captura toda excepción y sigue. Eso mantiene el
proceso vivo pero **oculta las fallas** — fue por eso que el crash de
enriquecimiento estuvo pasando desapercibido mientras el proceso figuraba
"activo".

- Llevá un contador de errores consecutivos por etapa. Si supera un umbral,
  escribí un estado visible en `parametros` que el tablero muestre.
- Registrá en cada ciclo: descubiertas, extraídas, enriquecidas, errores.

**Criterio de aceptación:** un ciclo completo termina con `errors: 0`
**Y `processed > 0`** en las tres etapas.

⚠️ Un ciclo con la cola vacía **no verifica nada**. La vez anterior se reportó
como verificación un ciclo que decía `processed: 0, ok: 0` — eso sólo prueba que
no revienta cuando no hay trabajo.

---

## FASE 4 — ESCALÓN DE MODELO CON GEMINI

`app/core/clasificador_llm.py` ya tiene toda la lógica difícil resuelta:
reintentos con backoff, tope diario, caché, reanudación. **Es agnóstico del
proveedor**: recibe una función `llamar(prompt) -> str`.

Lo único que tenés que escribir es el adaptador de Gemini:

```python
# app/core/gemini_cliente.py
from app.core.clasificador_llm import ErrorDeCuota, ErrorPermanente

def llamar_gemini(prompt: str) -> str:
    """
    Devuelve el texto crudo del modelo.
    DEBE levantar ErrorDeCuota ante 429 (con esperar_segundos si el servidor
    manda Retry-After) y ErrorPermanente ante 4xx que no mejora reintentando.
    """
    ...
```

Después:

```python
from app.core.clasificador_llm import ClasificadorLLM, Limitador

clasificador = ClasificadorLLM(
    llamar=llamar_gemini,
    limitador=Limitador(rpm_objetivo=10, tope_diario=900),   # conservador
)
```

**Reglas de esta fase:**

- **No hardcodees los límites del plan gratuito.** El módulo los descubre por
  los 429 y hace backoff. Poné `rpm_objetivo` y `tope_diario` conservadores y
  leelos desde `parametros`, no desde el código.
- **Corré primero los escalones 0 y 1** (reglas y embeddings) sobre las 109.223
  notas. Son locales y gratis, tardan minutos. Medí **cuántas notas quedan
  realmente ambiguas** antes de gastar una sola llamada de cuota. Puede que el
  residuo sea mucho menor al 5% estimado.
- **Priorizá por recencia.** Las notas nuevas primero. Si el backfill tarda una
  semana, el tablero ya está bien desde el día uno.
- **Persistí cada resultado apenas termina** (usá el callback
  `al_terminar_una`). Si el proceso muere, se retoma donde quedó.
- Corrélo como servicio en segundo plano, no como script de una corrida.

**Criterio de aceptación:** el proceso corre varios días sin intervención, se
detiene solo al agotar la cuota diaria, retoma al día siguiente, y `clasificador`
en la base registra qué escalón resolvió cada nota.

---

## FASE 5 — API

Endpoints nuevos. Todos aceptan el mismo rango temporal: `desde`, `hasta`,
`preset` (`hoy|ayer|7d|30d|anio|todo`).

| Endpoint | Devuelve |
|---|---|
| `GET /api/pulso` | Lecturas de cabecera + issues activos por pulso |
| `GET /api/mapa-opinion` | Un punto por issue: resonancia, saldo, controversia, total, clima |
| `GET /api/areas` | Agregado por área de gestión, **con cobertura** |
| `GET /api/areas/{area}` | Detalle: serie, climas, actores, issues, notas top |
| `GET /api/actores` | Ranking por NFS, menciones brutas y protagónicas |
| `GET /api/actores/{clave}` | Ficha: serie NFS, matriz tópico-persona, notas |
| `GET /api/friccion` | Pares de co-ocurrencia (NPMI, lift, soporte) |
| `GET /api/friccion/desfasaje?a=&b=` | **La curva completa**, no sólo el máximo |
| `GET /api/vacios` | Temas con alta reacción y baja cobertura |
| `GET /api/notas` | Explorador: filtros combinables, paginado, ordenable |

**Contrato que no se negocia:** todo agregado devuelve `cobertura` y
`notas_con_reacciones` junto al valor. Un saldo calculado sobre el 12% de las
notas y otro sobre el 90% no son comparables, y si la API no lo devuelve la
interfaz no lo puede mostrar.

`GET /api/friccion/desfasaje` devuelve el **array completo** de desfasajes con
sus observaciones. Devolver sólo el pico invita a leerlo como causalidad.

- Cacheá `/api/pulso` y `/api/mapa-opinion` 60 segundos: se consultan en cada
  carga y recorren toda la tabla.
- Rate limiting por usuario en todos los endpoints.

---

## FASE 6 — INTERFAZ

Leé `docs/arquitectura/01-interfaz.md` completo y mirá el prototipo.

### Dirección estética

**Estación de monitoreo, no dashboard SaaS.** Esquel vive pendiente de alertas
del SMN, partes de nieve y estado de rutas: el mundo de referencia es el boletín
meteorológico. Escalas de severidad, lecturas precisas, cifras tabulares.

**Evitá explícitamente:** panel oscuro con degradados violeta, glassmorphism,
tarjetas redondeadas todas iguales, Inter como tipografía, emojis como íconos de
sección, todo centrado. Esa estética es la que hace que un instrumento parezca
un juguete.

### Tokens exactos

| Rol | Claro | Oscuro |
|---|---|---|
| Fondo | `#EDEFF2` | `#101418` |
| Panel | `#F7F8FA` | `#171C22` |
| Hueco | `#E4E8ED` | `#1D242B` |
| Línea | `#D3D9E0` | `#2A333C` |
| Tinta principal | `#14181D` | `#F2F5F8` |
| Tinta secundaria | `#4A545F` | `#A8B3BE` |

Divergente (saldo): `#2a78d6` · `#C9CFD6` · `#e34948`
(oscuro: `#3987e5` · `#39434D` · `#e66767`)
Estado: `#0ca30c` `#fab219` `#ec835a` `#d03b3b` — **reservados**, nunca como
color de serie, siempre con etiqueta.

**Tipografía: Chivo y Chivo Mono** (Google Fonts). Toda cifra que se compare en
columna va en Chivo Mono con `font-variant-numeric: tabular-nums`.

### Los 6 tableros

1. **Pulso de la ciudad** — el del prototipo. Empezá por acá: es el que cambia
   la percepción del producto.
2. **Auditoría de gestión** — dos columnas, izquierda selectora, derecha
   reactiva. Separa *actividad* de *recepción*: un área con muchas notas y
   ninguna reacción es "se hizo y no se comunicó", y eso es un hallazgo, no un
   vacío de datos.
3. **Monitor de actores** — ranking por NFS, ficha por persona, matriz
   tópico-persona.
4. **Grafo de fricción** — matriz de co-ocurrencia + curva de desfasaje.
5. **Brújula editorial** — vacíos informativos, temas que se enfrían.
6. **Explorador** — tabla densa, filtros, presets cronológicos.

### Obligatorio en todos

- **Tooltips ⓘ** en cada KPI, encabezado de gráfico, encabezado de columna y
  control de filtro. Tres frases: qué mide, cómo se calcula, cómo se interpreta.
  Accesibles por teclado, no sólo por hover.
- **Presets cronológicos**: Hoy · Ayer · 7 días · 30 días · Este año · Histórico,
  más rango personalizado.
- **Modo claro y oscuro** con los tokens de arriba.
- **Vista de tabla** para cada gráfico (accesibilidad y exportación).
- **Datos ausentes dibujados como ausentes** (textura o vacío), nunca como cero.
- **Rebranding completo a Media Abrojal.** Red 43 queda acreditado como *fuente*
  en el pie y en cada nota enlazada — se saca el branding del producto, no la
  atribución de la fuente.

---

## FASE 7 — TELEMETRÍA

La migración v5 crea `sesiones_usuario` y `eventos_usuario`. Falta cablearlas.

- Registrar: login, duración de sesión, tableros visitados, filtros usados,
  exportaciones.
- **IP hasheada, nunca en claro.** Es dato personal.
- Panel de administración: usuarios, ingresos, tiempo activo, acciones.

---

## FASE 8 — RENOMBRAR RUTAS (ÚLTIMA, CON RESPALDO)

`/opt/red43_allsite`, `red43_allsite.sqlite`,
`red43_allsite_enriched_v1.sqlite`. Toca rutas absolutas en
`continuous_worker.py`, `reindex_taxonomy.py`, `run_server.sh` y la
configuración de servicios.

Es la tarea con peor relación riesgo/beneficio del plan: no cambia nada
funcional y puede dejar el sistema sin arrancar. **Va al final**, con la base
respaldada y el servicio detenido.

---

## COSAS QUE NO TENÉS QUE HACER

- ❌ **No cambies el proveedor de LLM.** El plan gratuito de Gemini se queda.
- ❌ **No saltees la fase 1.** Sin línea de base no se puede demostrar mejora.
- ❌ **No reescribas los módulos de `app/core/`** que vienen en la rama. Tienen
  63 tests que pasan y están escritos contra problemas concretos.
- ❌ **No borres `enrichment_worker.py`.** `evaluar_taxonomia.py` lo carga para
  comparar el clasificador viejo contra el nuevo.
- ❌ **No promedies las 4 métricas en un "índice general".** Es el mismo error
  que `positivas − negativas`, un nivel más arriba.
- ❌ **No muestres un saldo sin su cobertura.**
- ❌ **No uses la palabra "causa"** en el tablero de fricción. Es correlación
  con desfasaje.
- ❌ **No declares verificado un ciclo del worker con `processed: 0`.**
- ❌ **No hardcodees los límites de cuota de Gemini.**

---

## CÓMO VERIFICAR TODO

```bash
python3 -m pytest tests/ -v
```

63 tests: métricas (13), taxonomía (8), issues de Esquel (8), actores (9),
co-ocurrencia (8), clasificador con cuota (17).

Están escritos contra los problemas reales, no contra la implementación: si
alguien cambia una fórmula y una nota con 1 👍 vuelve a rankear por encima de
una con 450 👍 / 80 👎, el test falla.

Si `pytest` no está instalado, cualquier runner que importe los módulos y
ejecute las funciones `test_*` sirve.

---

## QUÉ REPORTAR AL TERMINAR

Por cada fase:

1. Qué hiciste y qué archivos tocaste.
2. **La salida real del comando de verificación**, pegada tal cual — no un
   resumen de que salió bien.
3. Los criterios de aceptación que se cumplieron y los que no.
4. Lo que quedó pendiente y por qué.

Si algo no se pudo hacer, decilo explícitamente. Un reporte que dice "listo" sin
la evidencia no sirve: ya pasó una vez que se reportó una re-indexación exitosa
y una taxonomía de 10 categorías que en la base no existía.
