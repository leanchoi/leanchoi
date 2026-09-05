# Prompt para Antigravity — Guillotina v8

> Copiá todo lo que está entre las líneas de guiones y pegalo en Antigravity.

---

## CONTEXTO

Trabajás sobre **Guillotina**, plataforma de inteligencia mediática civil para
Esquel y la Comarca Andina. Monitorea cuatro medios locales (Red 43, EQS Notas,
Canal 4 Esquel, FM Del Lago), mide la reacción de la audiencia en Facebook y
genera piezas editoriales a partir de la distancia entre lo que se anuncia y lo
que la gente reporta.

Hay dos mitades del sistema que hoy **no se tocan**:

- **En el VPS** (`187.77.224.159:8943`): el scraper, la base con ~109.000 notas
  históricas de Red 43, el `facebook_worker`, la API FastAPI y el tablero que
  está online. Es lo que el usuario ve.
- **En GitHub** (`leanchoi/media-abrojal`, rama `claude/taxonomia-v4`): 18
  módulos nuevos, 6.173 líneas, 308 pruebas en verde. Métricas, taxonomía,
  actores, semántica de reacciones, tensión cívica, pipeline editorial,
  indicadores por pestaña. **Ninguno está conectado a nada.**

Tu trabajo es juntarlas. No tenés que diseñar métricas: ya están diseñadas,
probadas y documentadas. Tenés que **integrarlas y construir la interfaz**.

## TAREA 0 — BLOQUEANTE. Hacer esto primero o nada más funciona.

El repositorio **no corre**:

```
$ python -c "import app.services.continuous_worker"
ModuleNotFoundError: No module named 'app.core.config'
```

La subida a GitHub fue parcial. Faltan, y existen en el VPS:

```
app/core/config.py
app/core/db.py
app/core/discovery.py
app/core/extractor.py
app/core/facebook_worker.py
app/server/            ← la API FastAPI y el tablero, entero
```

1. Subí esos archivos a `claude/taxonomia-v4`.
2. **Antes de commitear**, sacá todo secreto del código. Como mínimo:
   `SECRET_KEY = "red43_vps_super_secret_jwt_key_2026_safe"` pasa a variable de
   entorno, con un valor nuevo generado con `secrets.token_urlsafe(48)`. Rotá
   también la contraseña de admin. Mientras ese secreto esté publicado,
   cualquiera firma un token de administrador sin conocer la contraseña.
3. Verificá con `python -m pytest tests/ -q` que sigan las 308 en verde y que
   `import app.services.continuous_worker` no explote.
4. Recién ahí seguí.

No abras un PR con el secreto viejo en el historial. Si ya está en un commit,
rotalo igual: darlo de baja es lo que importa, no borrarlo del historial.

## TAREA 1 — El bug que invalida todo el tablero

En `app/core/facebook_worker.py`:

```python
reac_totales = max(5, comentarios_cnt * 2)
```

Las reacciones **no se leen: se inventan** a partir del conteo de comentarios.
Por eso el saldo del tablero está clavado en +0.325, el RTC constante en 0.50 y
los estados de crisis son inalcanzables por construcción. Ningún indicador de
opinión mide nada mientras esa línea exista.

Reemplazalo por lectura real vía **Graph API de Meta** con token de página:
`/{post-id}?fields=reactions.type(LIKE).summary(total_count).limit(0).as(like)`
y una línea equivalente por cada uno de los seis tipos. Guardá los seis
contadores por separado — `polisemia.py` los necesita desagregados, un total no
le sirve.

Si un post no devuelve reacciones, **guardá `NULL`, no cero y no un estimado**.
Todos los módulos nuevos declaran su cobertura y saben qué hacer con un dato
ausente; ninguno sabe qué hacer con uno inventado.

No implementes evasión de detección ni scraping automatizado del sitio: la
Graph API con token de página es el camino y además es el que no se rompe.

## TAREA 2 — Conectar los 18 módulos

Están sin integrar. Cuántas veces se referencia cada uno hoy, fuera de su
propio archivo y de las pruebas:

```
0  clasificador_llm   0  cooccurrence   0  gacetilla       0  kpis_calculo
0  polisemia          0  sintesis_gemini 0 tension_civica  0  voces
1  maduracion         1  seleccion_editorial   1  social_semantica
2  actores            2  metrics        2  limites_editoriales
3  comentarios        8  taxonomy  ← el único conectado
```

Orden de integración, cada paso deja el sistema funcionando:

| # | Módulo | Dónde engancha |
|---|---|---|
| 1 | `metrics` + `taxonomy` + `issues_esquel` | en `enrichment_worker`, por nota |
| 2 | `actores` | mismo paso, escribe `nota_actor` |
| 3 | `social_semantica` + `polisemia` | tras leer reacciones reales (Tarea 1) |
| 4 | `tension_civica` | necesita 3 mediciones del mismo post |
| 5 | `comentarios` + `sintesis_gemini` | worker aparte, cuota compartida |
| 6 | `cooccurrence` | proceso nocturno, no por nota |
| 7 | `maduracion` + `seleccion_editorial` | scheduler, 13 visitas en 48 h |
| 8 | `gacetilla` + `voces` | último, requiere aprobación humana |

**Reglas que no podés romper:**

- El plan de Gemini es el **gratuito Lite** y no se cambia. La clasificación
  temática y la síntesis de comentarios comparten el mismo tope diario: hay que
  sumarlas, no contarlas por separado. `clasificador_llm.Limitador` ya maneja
  espaciado, backoff y `Retry-After`; usalo, no escribas otro.
- `maduracion` no descarta un post antes de las **6 horas** ni lo sigue después
  de las **48**. Ese comportamiento fue pedido explícitamente. Está en
  `MIN_HORAS_PARA_DESCARTAR` y `HORAS_MAXIMAS`; no los toques.
- `seleccion_editorial.calcular_baseline_medio()` recibe **engagement**
  (`reacciones + comentarios*3`), no reacciones. Pasarle reacciones infla el
  baseline 1.58× y hace que el sistema seleccione el 78% de los posts. Ya pasó
  una vez.
- Toda pieza generada pasa por `limites_editoriales.verificar_texto()` antes de
  existir. Sin excepciones, sin flag para saltearlo.

## TAREA 3 — El tablero, con las seis correcciones pedidas

El usuario revisó el tablero desplegado y marcó seis cosas. Están todas
resueltas del lado del backend; falta la interfaz.

**3.1 — Los mismos 5 bloques en todas las pestañas.** Era el problema más
grande: un indicador global sirve una vez, repetido en seis pantallas el ojo lo
saltea y ocupa el mejor espacio de la página. `app/core/kpis.py` declara qué
indicador va en cada pestaña (`PESTAÑAS`) y `app/core/kpis_calculo.py` los
calcula. Son 25, cinco por pestaña, todos distintos. Usalos tal cual.

**Todo KPI trae `confiable` y `motivo`.** Cuando `confiable` es falso la
interfaz **no muestra el número**: muestra "sin datos suficientes · faltan N
para poder calcularlo". Esto no es opcional ni un caso borde — hoy el tablero
muestra saldos calculados sobre 6 reacciones con la misma tipografía que uno
sobre 6.000, y esa es la razón de fondo por la que no se puede confiar en la
pantalla.

**3.2 — Pestaña 1 (Radar): que se pueda interactuar y combinar.** Los cortes
disponibles están en `kpis.CORTES["radar"]`: medio, macro_eje, issue, clima,
nivel_alerta, franja_horaria. Armá los controles a partir de ese diccionario,
no hardcodeados — agregar un corte tiene que ser una línea en Python.
`kpis.combinacion_valida()` valida la combinación y devuelve **por qué** falla,
para que puedas decir "«área» no es un corte de radar" en vez de mostrar una
tabla vacía.

**3.3 — Pestaña 2 (Agenda): más insights.** El cuadrante ya está calculado. Lo
que falta mostrar es la lectura: `temas_demanda_oculta` es el hallazgo más
valioso de la pantalla —lo que le importa a la gente y los medios no cubren— y
tiene que estar arriba, no en una celda de una matriz. Agregá el detalle por
tema al hacer clic: qué notas, de qué medio, con qué eco.

**3.4 — Pestaña 3 (Gestión): desgranar.** Cortes en `kpis.CORTES["gestion"]`.
El drill-down va de área → notas del área → reacciones de la nota. Mostrá
siempre `cobertura_gestion`: un saldo sobre el 12% de las notas y otro sobre el
90% no son comparables y en pantalla se ven idénticos.

**3.5 — Pestaña 4 (Liderazgos): separar personas de instituciones.** Ya está
resuelto en `kpis.TIPOS_ACTOR`, `AMBITOS`, `LOCALIDADES`, `ROLES` y la
dataclass `FiltroActores`. **Dos listas separadas, no un ranking mezclado**:
poner a "Municipalidad de Esquel" a competir contra su propio intendente no
contesta ninguna de las dos preguntas. Un actor con menos de 5 menciones
protagónicas no entra en ningún ranking (`MINIMOS["actor"]`) — sin esa puerta
la tabla se llena de figuras "estables" que nunca fueron medidas.

**3.6 — La consola: las luces y la terminal.** El diagnóstico real: cuatro de
siete procesos **nunca se ejecutaron**, no es que fallen. Usá
`kpis_calculo.estado_proceso()`, que devuelve tres estados donde el tablero
tiene dos:

```python
ESTADO_NUNCA = "nunca_ejecuto"   # gris — problema de despliegue
ESTADO_ERROR = "error"           # rojo — problema de código
ESTADO_OK    = "ok"              # verde
```

Pintar los dos primeros iguales es lo que hace que la consola no comunique
nada. La terminal necesita que los workers **emitan eventos** — hoy no hay nada
que mostrar porque no hay nada corriendo. Definí una tabla `evento_sistema`
(momento, proceso, nivel, mensaje, contexto JSON) y que cada worker escriba ahí
al empezar, al terminar y al fallar. Servila por SSE, no por polling.

**Criterio visual.** Que no parezca dashboard genérico de IA: nada de seis
tarjetas idénticas con un número gigante y una flechita. Cada pestaña contesta
**una** pregunta —está escrita en `PESTAÑAS[x]["pregunta"]`— y todo lo que hay
en pantalla tiene que servir a esa pregunta. El campo `ayuda` de cada KPI
explica qué contesta, no cómo se calcula; usalo en el tooltip.

## TAREA 4 — Productificar el archivo de 109.000 notas

El archivo histórico de Red 43 sirve para tres cosas, en este orden:

1. **Baselines.** `tension_civica.BaseSegmento` necesita cuantiles empíricos por
   segmento para saber qué es "tensión alta" *en Esquel* y no en abstracto. Sin
   esto los umbrales son inventados.
2. **Series largas.** Un tema con 8 años de cobertura permite responder "¿esto
   siempre fue así o empeoró?", que es la pregunta que ningún tablero de la
   competencia contesta.
3. **Entrenamiento del léxico.** `taxonomy.LEXICO` e `issues_esquel` se pueden
   validar contra la sección real de cada nota. Cuidado con la fuga: **no le
   pases `section_visible` al clasificador si después vas a usarla como verdad
   de referencia.** Ese error ya se cometió y daba 90,2% cuando el número
   honesto era 74,2%.

Procesalo en lotes nocturnos, no en el pipeline en vivo, y guardá el resultado
materializado. No lo reproceses cada vez.

---

# CÓMO REPARTIR EL TRABAJO CON EL SEGUNDO MODELO (3.8 high)

Tenés dos modelos. El reparto que funciona no es por dificultad: es por
**si un error se ve o no se ve**.

**Al modelo 3.8 high, las tareas donde equivocarse es invisible.** Un cálculo
mal hecho devuelve un número plausible y nadie lo nota nunca:

- Tarea 1 entera — la lectura de reacciones y qué se guarda cuando falta un
  dato. Es el punto donde el sistema deja de mentir o sigue mintiendo.
- Tarea 2, pasos 3, 4 y 7 — polisemia, tensión cívica y maduración. Los tres
  tienen umbrales cuya calibración no se puede verificar mirando la pantalla.
- Tarea 4 — el archivo histórico, sobre todo evitar la fuga de datos.
- **Revisar la integración que hizo el otro modelo antes de mergear**, con una
  consigna concreta: *"¿este número se calculó sobre suficiente evidencia como
  para mostrarse?"*.

**Al modelo principal, las tareas donde equivocarse se ve enseguida.** La
pantalla queda fea, la prueba falla, el import explota:

- Tarea 0 completa — mover archivos, sacar secretos, verificar que importe.
- Tarea 2, pasos 1, 2, 5, 6 y 8 — plomería de integración con pruebas que ya
  existen y que fallan si te equivocás.
- Tarea 3 entera — todo el frontend. El feedback es inmediato y visual.
- SQL, migraciones, endpoints, SSE.

**Tres reglas del reparto:**

1. **Ningún modelo revisa su propio trabajo.** El que integra no aprueba la
   integración.
2. **Las 308 pruebas corren antes de cada commit**, las escriba quien las
   escriba. Si una falla, el commit no sale. No las "arregles" cambiando lo que
   esperan sin entender por qué fallaron: dos de los bugs más caros del
   proyecto se encontraron exactamente así.
3. **Ninguno de los dos cambia el proveedor de LLM.** El VPS está conectado al
   plan gratuito de Gemini Lite y así se queda. Si algo no entra en la cuota,
   la respuesta es priorizar qué se procesa, no cambiar de plan.

---

# ORDEN DE EJECUCIÓN

```
Tarea 0  ─────────────────────────────►  bloquea todo lo demás
              │
              ├─► Tarea 1  (3.8 high)  ──┐
              │                          ├─► Tarea 3  (principal)
              └─► Tarea 2  (repartida) ──┘
                            │
                            └─► Tarea 4  (3.8 high, nocturno)
```

# QUÉ DEVOLVER

Al terminar cada tarea, no un resumen: **evidencia**.

- La salida de `python -m pytest tests/ -q`.
- La salida de `python -c "import app.services.continuous_worker"` (tiene que
  ser silenciosa).
- Para la Tarea 1: un post real con los seis contadores de reacciones leídos de
  la Graph API, y otro donde la lectura falló mostrando que se guardó `NULL`.
- Para la Tarea 3: capturas de las cinco pestañas, incluyendo **una donde un
  KPI muestre "sin datos suficientes"**. Si ninguno lo muestra nunca,
  probablemente la puerta de confiabilidad no está conectada.

# DOCUMENTACIÓN DE REFERENCIA

Todo está en `docs/arquitectura/` de la rama `claude/taxonomia-v4`:

| Archivo | Qué contesta |
|---|---|
| `00-respuesta-al-brief.md` | por qué cada métrica es como es |
| `01-interfaz.md` | especificación de las pantallas |
| `02-plan-implementacion.md` | orden y dependencias |
| `03-capa-social.md` | reacciones, comentarios, seudonimización |
| `04-respuesta-dossier-v6.md` | polisemia del haha, RTC, síntesis |
| `05-pipeline-editorial.md` | maduración, selección, voces |
| `06-que-es-esto.md` | el sistema completo y sus comparables |
| `07-revision-tablero.md` | las seis correcciones de UX en detalle |
| `08-revision-conciencia.md` | **esta auditoría, con todo lo que falta** |

Y la línea editorial en `editorial/`: `00-corazon.md` (qué es este medio),
`01-pulso.md` (cómo escribe), `02-estructura.md`, `03-limites.md` (qué no hace
nunca), `04-formatos.md`, más `editorial/voces/` con las cinco voces.

Leé `08-revision-conciencia.md` antes de tocar nada.
