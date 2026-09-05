# Prompt para Antigravity — Guillotina v11

> Copiá **todo** lo que sigue y pegalo en Antigravity. Reemplaza al v10, que no
> llegó a pasarse. Es autocontenido: no hace falta ningún mensaje anterior.

---

# CONTEXTO

Trabajás sobre **Guillotina**, plataforma de inteligencia mediática civil para
Esquel y la Comarca Andina, Chubut. Monitorea cuatro medios locales, mide cómo
reacciona la audiencia en Facebook, y genera piezas editoriales a partir de la
distancia entre lo que se anuncia y lo que la gente reporta.

**Repositorio:** `leanchoi/media-abrojal`, rama `claude/taxonomia-v4`.
**Despliegue:** VPS `187.77.224.159`, puerto 8950.

Los cuatro medios:

| Medio | Facebook | Portal web |
|---|---|---|
| Canal 4 Esquel | 57.000 seguidores | `canal4esquel.com.ar` |
| EQS Notas | 45.000 | `eqsnotas.com` |
| FM del Lago 105.5 | 42.000 | `fmdellagoesquel.com.ar` |
| Red 43 | 31.000 | `red43.com.ar` |

**Hay cinco tareas.** Cuatro módulos nuevos ya están escritos y probados en
`app/core/`; tu trabajo es conectarlos, no diseñarlos. Cada tarea explica el
síntoma, la causa y qué falta. Al final está la referencia de API completa de
los módulos nuevos, así que no tenés que adivinar ninguna firma.

## Antes de tocar nada

```bash
git fetch origin claude/taxonomia-v4
git rebase origin/claude/taxonomia-v4
python -m pytest tests/ -q --ignore=tests/test_facebook_worker.py
```

Tienen que pasar **392**. Si no pasan, resolvé eso primero: el resto de este
documento asume esa base. (`test_facebook_worker.py` se excluye sólo si no
tenés Playwright instalado en el entorno donde corrés las pruebas.)

---

# TAREA A — El enlace de Facebook no abre

## El síntoma

El usuario probó un enlace generado por el sistema:

```
https://www.facebook.com/fb/posts/canal4esquel_461f1797b412    ← no abre
https://www.facebook.com/share/p/1EhKf2MCus/                   ← así son los reales
```

## La causa

Son dos, y hay que arreglar las dos.

**Primera.** En `app/services/facebook_worker.py:362`:

```python
post_id = p.get("post_id") or f"fb_{medio_id}_{hashlib.md5((texto[:120] + permalink).encode()).hexdigest()[:12]}"
```

Cuando el DOM no expone el id real, **el scraper se lo inventa**. `461f1797b412`
es un md5 truncado. De un identificador que inventamos nosotros no hay ningún
permalink derivable — y `permalink_facebook()` lo construía igual, produciendo
una URL con forma correcta y contenido falso. Es el mismo error que las
reacciones fabricadas.

**Segunda.** En `app/services/facebook_worker.py:359`:

```python
permalink = p.get("permalink") or medio["fb_url"]
```

El scraper **sí captura el permalink real** (línea 245), pero cuando no
encuentra el ancla cae a la URL de la página. Ese `or` es lo que manda al
usuario al muro del portal en vez de a la publicación.

## Ya está hecho

`app/core/ficha_nota.py` corregido: usa el permalink guardado, sólo construye
cuando los dos componentes son ids de Facebook reales (numéricos de 5+ dígitos
o `pfbid…`), y si no devuelve `None` con el motivo. Un enlace roto es peor que
ninguno: el roto se prueba y se pierde el tiempo, el ausente se ve de entrada.

## Qué falta

1. **Columna `permalink` en `social_posts`** y persistirla. Hoy el scraper la
   captura y se pierde.

   ```sql
   ALTER TABLE social_posts ADD COLUMN permalink TEXT;
   ALTER TABLE social_posts ADD COLUMN pagina_id TEXT;
   ```

2. **Cambiar el fallback de la línea 359:**

   ```python
   permalink = p.get("permalink") or None     # ya no medio["fb_url"]
   ```

3. **Pasarlo a la ficha.** `enlaces()` recibe el permalink como cuarto
   argumento; `ficha_nota.armar()` ya lo lee de `post["permalink"]`.

4. **En la interfaz**, cuando no hay enlace mostrar
   `enlaces()["motivo_sin_publicacion"]`, no un botón que no lleva a ningún
   lado.

5. **Opcional pero mejor:** capturar del DOM el `post_id` numérico real. Si lo
   conseguís, el permalink se puede reconstruir siempre. Sin eso, el permalink
   guardado igual resuelve el problema.

## Criterio de aceptación

- Un enlace generado por el sistema abre la publicación en el navegador.
- Una publicación sin permalink muestra el motivo, no un botón muerto.

---

# TAREA B — El taller: dónde viven las notas aprobadas

## El problema

Hoy una pieza aprobada no va a ningún lado. No se puede consultar, ni convertir
en nada.

## Ya está hecho

`app/core/taller.py`, con pruebas.

## Qué construir

### B.1 — Los estados

El ciclo pasa a ser:

```
borrador → en_revision → aprobada → en_taller → derivada_lista → publicada
                                                                    ↓
                                                               archivada
```

`taller.transicion_valida(desde, hacia)` devuelve `(bool, motivo)` y el motivo
dice cuáles sí se puede desde ese estado.

**`en_taller` está separado de `aprobada` a propósito. No los unifiques en un
solo botón.** Aprobar una nota y aprobar un reel son dos decisiones distintas:
si se confunden, un error de tono en un video queda respaldado por la revisión
que se le hizo al texto — y el video lo ve diez veces más gente.

### B.2 — Pestaña nueva "Taller"

Lista de piezas en estado `aprobada` o posterior. Al abrir una:

| Bloque | Función | Qué muestra |
|---|---|---|
| La pieza | — | El texto tal como quedó aprobado |
| Derivaciones | `derivaciones_disponibles(pieza, issue_reaparece)` | Qué formatos tienen sentido, con el motivo de cada uno |
| Guion | `guion_video(pieza, voz, formato, contexto)` | Escenas con locución, texto en pantalla, visual y segundos |
| Hilo | `hilo_x(pieza, contexto, enlace)` | Tuits numerados con gancho |
| Imagen | `prompt_de_imagen(pieza)` | Descripción para pegar en el generador |

**Botón de copiar en cada bloque.** El guion se pega en otra herramienta; que
haya que seleccionarlo a mano arruina el flujo entero.

**No ofrezcas los cinco formatos siempre.** `derivaciones_disponibles()` ya
filtra: una pieza sin conflicto no habilita La Bronca, y forzarla produce el
peor resultado posible del sistema — indignación fabricada sobre un hecho que
no la tiene. Mostrá el campo `motivo` de cada derivación junto al botón.

### B.3 — Las advertencias se muestran

`guion_video()` devuelve `Guion.advertencias`: cuando el guion no entra en el
formato, cuando el texto en pantalla no se va a leer en vertical, o cuando una
escena viola los límites editoriales.

**No lo recortes solo.** Recortar cambia lo que dice, y lo que dice es lo que
una persona aprobó. El sistema avisa; la persona decide qué sacar. Mostralas en
ámbar arriba del guion, no escondidas.

### B.4 — Tabla nueva

```sql
CREATE TABLE IF NOT EXISTS derivada (
    id          INTEGER PRIMARY KEY,
    pieza_id    TEXT NOT NULL REFERENCES pieza(id),
    voz         TEXT,
    formato     TEXT,
    plataforma  TEXT,
    guion_json  TEXT NOT NULL,
    estado      TEXT NOT NULL DEFAULT 'borrador',
    revisor     TEXT,
    revisada_at TEXT,
    publicada_at TEXT,
    creada_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_derivada_pieza ON derivada(pieza_id);

CREATE TRIGGER IF NOT EXISTS trg_derivada_requiere_revisor
BEFORE UPDATE OF estado ON derivada
WHEN NEW.estado = 'publicada' AND (NEW.revisor IS NULL OR NEW.revisor = '')
BEGIN
    SELECT RAISE(ABORT, 'una derivada no se publica sin revisor humano');
END;
```

Mismo criterio que `pieza`: la regla vive en la base, no en el código, porque
en el código se puede saltear con un flag.

## Criterio de aceptación

- Un guion completo visible, con sus advertencias.
- Una pieza que no habilita La Bronca no la ofrece.
- Intentar publicar una derivada sin revisor falla en la base.

---

# TAREA C — La memoria del archivo

## Por qué importa

Cuando el sistema detecta que vale la pena escribir sobre el repaso de la calle
Fontana, el archivo de 109.000 notas de Red 43 probablemente ya tenga cinco
veces la misma historia. Encontrarlas convierte una gacetilla en periodismo: no
es *"la municipalidad niveló la calle"*, es *"la nivelaron por cuarta vez en dos
años, y las tres anteriores el reclamo volvió a los cuatro meses"*.

Es lo único que un medio local con archivo puede hacer y los demás no.

## Ya está hecho

`app/core/contexto_historico.py`, con pruebas.

## Qué falta: la búsqueda ancha

El módulo recibe una lista de notas candidatas y decide **cuáles merecen
citarse**. Traer esas candidatas de entre 109.000 es tuyo.

### C.1 — Índice de texto completo

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS archivo_fts USING fts5(
    note_id UNINDEXED,
    titulo,
    cuerpo,
    tokenize = 'unicode61 remove_diacritics 2'
);
```

Poblalo desde `enriched_articles` en un job nocturno. `remove_diacritics 2` es
necesario: sin eso "nivelación" y "nivelacion" son términos distintos.

### C.2 — El flujo

```python
from app.core import contexto_historico as ch

consulta = ch.expandir(titulo, texto, issue, actores)

# Los términos FTS salen de las anclas, no de todo el título.
terminos = list(consulta.lugares) + sorted(consulta.terminos)[:8]
query = " OR ".join(f'"{t}"' for t in terminos)

filas = conn.execute("""
    SELECT f.note_id, f.titulo, e.fecha_publicacion AS fecha,
           e.medio_id AS medio, e.issue, e.url, f.cuerpo AS texto
    FROM archivo_fts f
    JOIN enriched_articles e ON e.note_id = f.note_id
    WHERE archivo_fts MATCH ?
    ORDER BY rank
    LIMIT 200
""", (query,)).fetchall()

antecedentes = ch.buscar(consulta, [dict(r) for r in filas],
                         excluir={post_actual})
material = ch.material_para_pieza(antecedentes)
```

`material` devuelve:

```python
{
  "citables":       [...],   # confianza directa — entra en texto automático
  "sugerencias":    [...],   # probable — se la muestra a quien revisa
  "recurrencia":    {...} | None,
  "frase_contexto": "El archivo registra 4 episodios equivalentes…",
  "hay_contexto":   True,
}
```

### C.3 — Dónde engancha

1. **`app/cli/job_maduracion_editorial.py`**, antes de generar la pieza:
   `frase_contexto` entra en el texto, y `hay_contexto` se pasa como
   `issue_reaparece` a `taller.derivaciones_disponibles()`.
2. **La ficha del popup**, como bloque "Antecedentes".
3. **El taller**, como parámetro `contexto` de `guion_video()`.

## Lo que NO podés relajar

Vincular dos hechos que no lo están publica algo falso con aire de dato duro —
la peor forma de estar equivocado, porque el lector no tiene cómo verificarlo.
Tres reglas sostienen eso:

- **El issue no es un ancla.** `estado_rutas` es una categoría con cientos de
  notas adentro. Sólo un **lugar** o un **actor** compartido autoriza un
  antecedente `directo`. Sin esa regla, "es la cuarta vez que repasan Fontana"
  puede terminar citando una obra en Melipal.
- **`citables` y `sugerencias` van separadas** en la interfaz y en el texto.
  Mezclarlas hace que la parte insegura viaje con la seguridad de la parte
  segura.
- **Cada antecedente trae `por_que`** — qué coincidió exactamente. Mostralo.
  Sin eso la correlación no es auditable y hay que creerle.

**Los umbrales no están calibrados.** `UMBRAL_DIRECTO = 0.62` y
`UMBRAL_PROBABLE = 0.34` salieron de razonar sobre los pesos, no de medir. Hasta
que se validen contra treinta casos reales, las citas automáticas pasan por
revisión humana.

## Criterio de aceptación

- Buscar antecedentes de "repaso de calle Fontana" devuelve las notas de
  Fontana como `citables` y las de otros barrios como `sugerencias`.
- Cada resultado muestra por qué se vinculó.

---

# TAREA D — Los portales web de los cuatro medios

## El problema

Hoy se ingiere **el sitio de Red 43** y las **páginas de Facebook** de los
cuatro. Los otros tres portales no se leen — y son tres, no uno:

| Medio | Portal | Plataforma | Estado |
|---|---|---|---|
| Red 43 | `red43.com.ar` | sitemap propio | se ingiere |
| Canal 4 Esquel | `canal4esquel.com.ar` | **WordPress** | falta |
| FM del Lago | `fmdellagoesquel.com.ar` | **WordPress** | falta |
| EQS Notas | `eqsnotas.com` | CMS propio (Mongo) | falta |

Y sumar un medio hoy no es configurar sino editar código, porque
`app/core/discovery.py:18` tiene el dominio en una regex de módulo:

```python
SITEMAP_RE = re.compile(r"https?://www\.red43\.com\.ar/sitemaps_index/sitemap\d+\.xml")
```

## Ya está hecho

`app/core/medios.py`: el registro de los cuatro con su plataforma, su
estrategia de ingesta, el armado de la consulta a WordPress, la normalización
de la respuesta y el emparejado con los posteos de Facebook.

## D.1 — Refactorizar discovery y config

**Es la tarea central; el resto es mecánico.** `discovery.py` y `config.py`
tienen que leer de `medios.REGISTRO` en vez de tener constantes `RED43_*` y
dominios en regex. Después de esto, sumar un medio es una entrada en el
registro.

## D.2 — Son dos extractores, no tres

Canal 4 y FM del Lago corren WordPress, que expone `/wp-json/wp/v2/posts`.
**No scrapees HTML en esos dos.**

```python
from app.core import medios as md

m = md.REGISTRO_POR_CLAVE["fmdellago"]
url, params = md.consulta_wp(m, pagina=1)     # desde = 6 meses atrás
# GET url con params → lista de items
notas = [md.nota_desde_wp(m, item) for item in items]
```

**Por qué la API y no HTML.** Un extractor de HTML se rompe cuando el medio
cambia el tema visual, y se rompe **en silencio**: sigue devolviendo texto,
sólo que el equivocado. La API devuelve campos nombrados o falla ruidosamente.
Para un sistema que después va a correlacionar ese texto y publicar
afirmaciones sobre él, esa diferencia decide si se puede confiar en el
resultado.

**Verificá primero que la API responda.** Algunos WordPress la tienen cerrada.
Si devuelve 401/403, caé a sitemap — `/wp-sitemap.xml` en WordPress 5.5+, o
`/sitemap_index.xml` si usan Yoast — y cambiá `estrategia` en el registro para
que quede documentado.

**EQS Notas sí necesita extractor de HTML.** Sus notas son
`/{slug}_t{objectid}` — ese sufijo es un ObjectId de Mongo de 24 hexadecimales
y sirve como identificador estable. Las secciones son `/actualidad`,
`/policiales`, y hay `/search?text=`.

## D.3 — Reglas de ingesta

- **Seis meses** (`medios.MESES_DE_HISTORICO`). El archivo completo sólo lo
  necesitamos de Red 43, que ya lo tenemos.
- **`_fields` recortado**, que `consulta_wp()` ya arma. Sin eso, WordPress
  devuelve el HTML renderizado con todo el tema: sobre seis meses son cientos
  de megabytes de markup que hay que descargar, guardar y volver a limpiar.
- **`robots.txt`, `User-Agent` identificado, 1,5 s entre pedidos**
  (`medios.ESPERA_SEGUNDOS`). Son medios locales con infraestructura chica:
  saturarlos es un problema técnico y también de vecindad.
- **Guardá `origen='web'|'facebook'`** en cada nota.

## D.4 — Vincular la nota web con su posteo

```python
vinculadas = md.emparejar(notas_web, posts_fb)
```

Empareja por URL canónica normalizada: los medios comparten el enlace con
`?fbclid=` y `utm_source=`, así que comparadas crudas la misma nota no se
reconoce a sí misma.

**Sólo coincidencia exacta de URL. No aproximes por título:** dos notas del
mismo medio sobre el mismo hecho tienen títulos casi idénticos, y una unión
equivocada le atribuye a una nota los comentarios de otra.

Ese vínculo es lo que permite decir "esta nota tuvo 400 comentarios" con el
texto completo al lado. Hoy tenemos una cosa o la otra, nunca las dos.

## D.5 — Mostrarlo en la consola

`medios.resumen_ingesta()` devuelve el estado de los cuatro, con Facebook y web
en columnas separadas. Que tres portales no se estuvieran leyendo no aparecía
en ninguna pantalla, y por eso pasó desapercibido hasta que alguien lo
preguntó.

## Criterio de aceptación

- `discovery.py` sin ningún dominio hardcodeado.
- Seis meses de notas de los tres portales en la base, con `origen='web'`.
- Al menos una nota web vinculada a su posteo de Facebook.
- La consola muestra los cuatro medios con su estado de ingesta.

---

# TAREA E — Sanidad de lo anterior

Cosas que quedaron señaladas y no están confirmadas.

1. **`SECRET_KEY` fuera del código.** Confirmame que
   `red43_vps_super_secret_jwt_key_2026_safe` ya no está en ningún archivo, que
   se generó uno nuevo con `secrets.token_urlsafe(48)`, que vive en variable de
   entorno, y que la contraseña de admin se rotó. Mientras ese secreto siga
   publicado, cualquiera firma un token de administrador sin conocer la
   contraseña.

2. **`exactitud léxica 18.96%`** en el log del job de archivo histórico. La
   medición honesta de la taxonomía dio **74,2%**. Un 18,96% significa que el
   job compara contra un campo que no es la sección real, o que el léxico no
   cubre el vocabulario de las notas viejas. Averiguá cuál de las dos.

   Importa porque esos baselines calibran los umbrales de crisis: si están
   construidos sobre clasificaciones equivocadas, los umbrales también lo van a
   estar, y nadie lo va a notar mirando el tablero.

---

# REFERENCIA DE API

Firmas exactas de los módulos nuevos. No adivines ninguna.

## `app/core/medios.py`

```python
WP_API = "wp_api";  SITEMAP = "sitemap";  HTML = "html"
MESES_DE_HISTORICO = 6;  POR_PAGINA = 100;  ESPERA_SEGUNDOS = 1.5

REGISTRO: tuple[Medio, ...]              # los cuatro medios
REGISTRO_POR_CLAVE: dict[str, Medio]     # "red43" | "canal4esquel" | "fmdellago" | "eqsnotas"

class Medio:
    clave, nombre, fb_pagina, web, plataforma, estrategia,
    sitemap, seguidores, activo_web, notas
    .tiene_web -> bool
    .url_api   -> str          # "" si no es WordPress

con_web()            -> list[Medio]
pendientes_de_web()  -> list[Medio]
por_estrategia(e)    -> list[Medio]
resumen_ingesta()    -> list[dict]
desde_por_defecto(referencia=None) -> str
consulta_wp(medio, pagina=1, desde="", por_pagina=100) -> tuple[str, dict]
nota_desde_wp(medio, item: dict)   -> dict
clave_de_vinculo(url: str)         -> str
emparejar(notas_web, posts_fb)     -> list[dict]
```

## `app/core/taller.py`

```python
ESTADOS = ("borrador","en_revision","aprobada","en_taller",
           "derivada_lista","publicada","archivada")
SEGUNDOS_GANCHO = 3.0;  PALABRAS_POR_SEGUNDO = 2.6;  LIMITE_TUIT = 275

transicion_valida(desde, hacia)  -> tuple[bool, str]
derivaciones_disponibles(pieza: dict, issue_reaparece=False) -> list[dict]
    # [{voz, etiqueta, formatos, motivo}, …]
guion_video(pieza, voz, formato="reel", contexto="") -> Guion
    # Guion.escenas[].{n, locucion, en_pantalla, visual, segundos}
    # Guion.{duracion, etiqueta, prompt_imagen, advertencias}
    # .to_row() para serializar
hilo_x(pieza, contexto="", enlace="") -> dict
    # {tuits: [str], prompt_imagen, etiqueta, advertencias}
prompt_de_imagen(pieza) -> str
duracion_estimada(texto) -> float
```

La `pieza` que reciben es un dict con: `estado, titular, bajada, hechos (list),
numero, que_queda, angulo, testimonios, fuerza_angulo, tema, lugar,
clip_anuncio`.

## `app/core/contexto_historico.py`

```python
CONFIANZA_DIRECTO="directo";  CONFIANZA_PROBABLE="probable"
UMBRAL_DIRECTO=0.62;  UMBRAL_PROBABLE=0.34;  MIN_PARA_RECURRENCIA=3

expandir(titulo, texto="", issue="", actores=None) -> Consulta
    # Consulta.{lugares, familias, issue, actores, terminos, tiene_ancla}
buscar(consulta, archivo: list[dict], tope=8, referencia=None, excluir=None)
    -> list[Antecedente]
    # Antecedente.{note_id, titulo, fecha, medio, puntaje, confianza,
    #              por_que, meses_atras, url}  · .to_row()
analizar_recurrencia(antecedentes) -> Recurrencia | None
material_para_pieza(antecedentes) -> dict
```

Las notas del `archivo` son dicts con: `note_id, titulo, texto, fecha, medio,
issue, url, actores`.

## `app/core/ficha_nota.py`

```python
MIN_COMENTARIOS_SINTESIS = 5;  MIN_REACCIONES_SALDO = 30

es_url_de_publicacion(url) -> bool
permalink_facebook(post_id, pagina_id=None, permalink_guardado=None) -> str | None
enlaces(post_id, pagina_id=None, url_nota=None, permalink_guardado=None) -> dict
    # {nota, publicacion, motivo_sin_publicacion}
armar(post, resumen=None, actores=None, hilo=None, lectura=None, editorial=None) -> dict
    # cada bloque: {disponible, motivo, datos?}
```

## `app/core/titulos.py`

```python
es_identificador_opaco(titulo) -> bool
titulo_para_mostrar(titulo, texto_post=None, medio=None) -> tuple[str, bool]
apta_para_pipeline(titulo, texto_post=None, minimo_palabras=4) -> tuple[bool, str]
```

## `app/core/kpis_calculo.py`

```python
ESTADO_NUNCA="nunca_ejecuto"; ESTADO_OK="ok"
ESTADO_ATRASADO="atrasado";   ESTADO_ERROR="error"

estado_proceso(p: dict, cadencia_horas=None) -> str
radar(alertas, posts, dinamicas)      -> dict[str, KPI]
agenda(temas)                          -> dict[str, KPI]
gestion(areas)                         -> dict[str, KPI]
liderazgos(actores)                    -> dict[str, KPI]
feed_social(posts)                     -> dict[str, KPI]
explorador(notas)                      -> dict[str, KPI]
cola_editorial(piezas, cupos, en_maduracion, descartadas) -> dict[str, KPI]
consola(procesos, eventos, posts_madurando, cuota_usada, cuota_tope) -> dict[str, KPI]
```

---

# INVARIANTES — no se tocan

1. **El proveedor de LLM no cambia.** El VPS está conectado al plan **gratuito
   de Gemini Lite** y así se queda. Si algo no entra en la cuota, la respuesta
   es priorizar qué se procesa, no cambiar de plan. La clasificación temática y
   la síntesis de comentarios comparten el mismo tope diario: hay que sumarlas,
   no contarlas por separado. `clasificador_llm.Limitador` ya maneja espaciado,
   backoff y `Retry-After` — usalo, no escribas otro.

2. **Nada se publica sin revisor humano.** Ni piezas ni derivadas. La regla vive
   en un trigger de la base, no en el código.

3. **Maduración: mínimo 6 horas antes de descartar, máximo 48 de seguimiento.**
   Están en `maduracion.MIN_HORAS_PARA_DESCARTAR` y `HORAS_MAXIMAS`. Fue pedido
   explícitamente y no se ajusta.

4. **`seleccion_editorial.calcular_baseline_medio()` recibe engagement**
   (`reacciones + comentarios*3`), no reacciones. Pasarle reacciones infla el
   baseline 1,58× y hace que el sistema seleccione el 78% de los posts. Ya pasó
   una vez.

5. **Todo texto publicable pasa por `limites_editoriales.verificar_texto()`.**
   Sin excepciones y sin flag para saltearlo. Incluye guiones y tuits.

6. **Un dato ausente se guarda como `NULL`, nunca estimado.** Vale para
   reacciones, títulos y permalinks. Todos los módulos declaran su cobertura y
   saben qué hacer con un dato que falta; ninguno sabe qué hacer con uno
   inventado.

7. **Nada de evasión de detección ni scraping agresivo.** Graph API con token
   de página, API de WordPress, y pedidos espaciados.

---

# REPARTO CON EL SEGUNDO MODELO (3.8 high)

El criterio no es la dificultad: es **si el error se ve o no se ve**.

**A 3.8 high, donde equivocarse es invisible** — devuelve algo plausible y nadie
lo detecta:

- **Tarea C entera.** La consulta FTS y los umbrales deciden qué se cita como
  antecedente. Una correlación equivocada produce una afirmación falsa que el
  lector no puede verificar.
- **Tarea A, punto 1 y 2.** Qué se guarda cuando no hay permalink.
- **Tarea D.2**, decidir la estrategia por medio y verificar que la API
  responde de verdad.
- **Tarea E.2**, el 18,96%.
- **Revisar la integración del otro modelo antes de mergear**, con una consigna
  concreta: *"¿este dato se calculó sobre suficiente evidencia como para
  mostrarse, y este vínculo es sólido como para citarlo?"*.

**Al modelo principal, donde el error se manifiesta solo** — la prueba falla, la
pantalla queda mal, el import explota:

- **Tarea A, puntos 3 a 5.** Migración, wiring, interfaz.
- **Tarea B entera.** Pestaña, estados, tabla, trigger.
- **Tarea D.1, D.3, D.4, D.5.** Refactorización y plomería.
- **Tarea E.1.** Rotar secretos.

**Tres reglas del reparto:**

1. Ningún modelo revisa su propio trabajo.
2. Las 392 pruebas corren antes de cada commit. Si una falla, el commit no sale
   — y no la "arregles" cambiando lo que espera sin entender por qué falló: dos
   de los bugs más caros del proyecto se encontraron exactamente así.
3. Los invariantes de arriba no se negocian, los pida quien los pida.

---

# ORDEN DE EJECUCIÓN

```
A ──────────────► rápido, desbloquea la ficha y el taller
       │
       ├─► B ───► necesita A para el enlace del hilo
       │
D.1 ───┼─► D.2 ─► D.3 ─► D.4 ─► D.5
       │            │
       └─► C ◄──────┘   C mejora mucho con el texto completo de D,
                        pero puede arrancar sólo con el archivo de Red 43
E puede hacerse en paralelo en cualquier momento.
```

---

# QUÉ DEVOLVER

Evidencia, no un resumen.

1. `python -m pytest tests/ -q` completo.
2. **Tarea A:** un enlace generado por el sistema, abierto en el navegador; y
   una publicación sin permalink mostrando el motivo en vez de un botón muerto.
3. **Tarea B:** captura de un guion completo con sus advertencias visibles, y
   la prueba de que el trigger rechaza publicar sin revisor.
4. **Tarea C:** la búsqueda de antecedentes de "repaso de calle Fontana", con
   `citables` y `sugerencias` separadas y el motivo de cada vínculo.
5. **Tarea D:** conteo de notas por medio y por origen
   (`SELECT medio, origen, COUNT(*) FROM … GROUP BY 1,2`), y una nota web
   vinculada a su posteo de Facebook.
6. **Tarea E:** confirmación de la rotación del secreto, y el diagnóstico del
   18,96%.

---

# DOCUMENTACIÓN

Todo en `docs/arquitectura/` de la rama:

| Archivo | Qué contesta |
|---|---|
| `00-respuesta-al-brief.md` | por qué cada métrica es como es |
| `01-interfaz.md` | especificación de las pantallas |
| `02-plan-implementacion.md` | orden y dependencias |
| `03-capa-social.md` | reacciones, comentarios, seudonimización |
| `04-respuesta-dossier-v6.md` | polisemia del haha, RTC, síntesis |
| `05-pipeline-editorial.md` | maduración, selección, voces |
| `06-que-es-esto.md` | el sistema completo y sus comparables |
| `07-revision-tablero.md` | las correcciones de UX |
| `08-revision-conciencia.md` | auditoría de integración |
| `09-taller-y-archivo.md` | **taller, archivo y evaluación de herramientas** |

Y la línea editorial en `editorial/`: `00-corazon.md` (qué es este medio),
`01-pulso.md` (cómo escribe), `02-estructura.md`, `03-limites.md` (qué no hace
nunca), `04-formatos.md`, más `editorial/voces/` con las cinco voces.

Leé `09-taller-y-archivo.md` antes de empezar con B, C o D.
