# Prompt para Antigravity — Guillotina v9 (correcciones del tablero)

> Copiá desde acá hasta el final y pegalo en Antigravity.

---

Buen trabajo con las tareas 0 a 4: el repo ya corre, los módulos están
integrados y el tablero muestra los KPI por pestaña. Cuatro defectos aparecieron
al usarlo. **Los tres primeros ya están corregidos en `app/core/`** — sólo hay
que conectarlos. El cuarto es una funcionalidad nueva.

Traé primero la rama:

```bash
git fetch origin claude/taxonomia-v4 && git rebase origin/claude/taxonomia-v4
python -m pytest tests/ -q          # deben pasar 347
```

---

## A — Procesos sanos que salían en rojo *(ya corregido, verificar)*

`cola_editorial`, `gacetilla` y `scraper_social` aparecían en ERROR con el
mensaje "…con éxito" al lado. Habían terminado bien seis horas antes;
`estado_proceso()` usaba un umbral único de 2 horas para todos los procesos.

Ya está corregido en `app/core/kpis_calculo.py`:

- `CADENCIA_HORAS` — cada proceso se mide contra su propia frecuencia.
- Cuarto estado `ESTADO_ATRASADO`, separado de `ESTADO_ERROR`.

**Lo que falta hacer:**

1. Pintar los cuatro estados distinto en la consola. Gris `nunca_ejecuto`,
   verde `ok`, **ámbar `atrasado`**, rojo `error`. Hoy hay tres colores para
   cuatro estados y los dos que se confunden son los que se arreglan distinto:
   `atrasado` es el scheduler que no dispara, `error` es el código.
2. Registrar en `CADENCIA_HORAS` cualquier proceso que agregues. Los que no
   figuran caen a 6 h por defecto, que para un scraper es demasiado y para un
   trabajo semanal es poco.
3. Que `estado_procesos` guarde también `ultimo_error`. `estado_proceso()` lo
   usa para distinguir "la última corrida falló" de "hace mucho que no corre",
   y hoy varios jobs sólo escriben `ultimo_ok`.

## B — La cola editorial repetía notas *(ya corregido, falta conectar)*

En el PDF de la Cola Editorial, «Cierre de FríoSur» aparece **dos veces**: una
aprobada y otra en revisión. La causa: `armar_cola()` no tenía memoria. Un post
con buen puntaje lo sigue teniendo mañana, así que vuelve a ganar el cupo — y
la ventana de maduración lo revisa 13 veces en 48 h, así que sin filtro produce
13 piezas.

`armar_cola()` ahora acepta dos exclusiones. En
**`app/cli/job_maduracion_editorial.py:281`** hay que pasárselas:

```python
ya = {r["post_id"] for r in conn.execute(
    "SELECT DISTINCT post_id FROM pieza WHERE post_id IS NOT NULL")}

titulos = [r["titulo"] for r in conn.execute(
    "SELECT titulo FROM pieza WHERE creada_at >= datetime('now','-14 days')")]

cola = armar_cola(candidatas_agrupadas, cupo=cupo_cola,
                  max_por_medio=2, max_por_angulo=2,
                  ya_con_pieza=ya, titulos_publicados=titulos)
```

Y agregá el índice, que es lo que lo vuelve imposible en vez de improbable:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS ux_pieza_post ON pieza(post_id);
```

**Dato del camino:** al probarlo apareció que el umbral de solapamiento de 0,55
no alcanzaba. Los dos títulos reales del cierre de FríoSur dan Jaccard 0,50.
Fundir dentro de una corrida y recordar entre corridas tienen errores caros
distintos —perder una historia vs. publicar dos veces lo mismo—, así que ahora
son dos umbrales: `UMBRAL_MISMO_EVENTO = 0.55` y `UMBRAL_YA_PUBLICADO = 0.45`.

**Además, en el frontend:** la sección "Borradores Generados" muestra todo el
histórico sin filtrar por fecha, mientras arriba la cola del día dice "no hay
piezas para hoy". Filtrala por la ventana activa, o titulala "Todas las piezas"
y agregale su propio selector. Hoy las dos secciones se contradicen en la misma
pantalla.

## C — Identificadores de Facebook mostrados como títulos *(módulo nuevo)*

En el Feed Social aparecen entradas así:

```
HI5VjCTYE7MBFCBgsCGGen3QSbhWo9DXPZnZTa3NYAJiYYV8WyUgEvKgZEMjka7WzcKtV
zuGqXZYyiqKFMPIyCXB4d1MXYKLHseatenuuDQ
```

Son identificadores. Pasa cuando la publicación no tiene nota enlazada —un
estado, una foto, un vivo— y el scraper guarda el primer identificador que
encuentra en vez de admitir que no hay título.

Usá **`app/core/titulos.py`**:

```python
from app.core.titulos import titulo_para_mostrar, apta_para_pipeline

titulo, es_real = titulo_para_mostrar(row["titulo"], row["texto"], row["medio"])
```

Tres cosas, en orden de importancia:

1. **`apta_para_pipeline()` antes de evaluar una candidata editorial.** Una
   gacetilla generada a partir de una cadena base62 es el peor resultado
   posible del pipeline, y hoy nada lo impide. El motivo del descarte va a
   `eventos_sistema`, no a `pass`: si mañana el 40% del feed se descarta acá,
   hay que poder verlo.
2. **En el scraper, dejar de guardar el identificador.** `titulo IS NULL` es la
   respuesta correcta cuando no hay título — igual que hiciste con las
   reacciones en la Tarea 1. Un dato ausente es manejable; uno inventado no.
3. **En la interfaz, marcar visualmente cuando `es_real` es falso.** El usuario
   tiene derecho a saber que ese texto es el cuerpo de la publicación y no lo
   que el medio tituló. Bastan un tono más tenue y una etiqueta "sin título".

## D — Ficha al hacer clic en un título *(módulo nuevo, es la tarea grande)*

Hoy los títulos son texto muerto, y donde hay enlace lleva **al muro general
del portal** en vez de a la publicación: el usuario tiene que buscar a mano lo
que estaba mirando.

**`app/core/ficha_nota.py`** arma la respuesta completa:

```python
from app.core.ficha_nota import armar

ficha = armar(post, resumen=..., actores=..., hilo=..., lectura=...,
              editorial=...)
```

Devuelve título saneado, los dos enlaces, y cinco bloques: `sintesis`,
`actores`, `comentarios`, `reaccion`, `editorial`.

**Endpoint:** `GET /api/v6/nota/{post_id}/ficha`. Un solo viaje; el popup no
debería hacer cinco pedidos.

**El enlace correcto.** `permalink_facebook()` ya lo construye. El id compuesto
que devuelve la Graph API es `{pagina}_{post}`; quedarse con la primera mitad
da la página del portal, que es el enlace inútil de hoy. Guardá `pagina_id` y
`url_nota` en `social_posts` si todavía no están.

**Lo que no se puede perder al maquetarlo.** Cada bloque trae `disponible` y
`motivo`. Cuando `disponible` es falso, el popup **muestra el motivo**, no un
espacio en blanco:

> *Reacción — 1 reacción valorable: por debajo de 30 el saldo es el prior, no
> una medición.*

Eso es más honesto y más útil que un `RTC*: 0.115` que en tu propia captura se
repite idéntico en tres notas distintas, porque con un like el número que se
muestra es el prior del estimador. Un hueco sin explicación hace que el usuario
no distinga "no hay datos" de "se rompió", y termina desconfiando de las dos.

**Dónde engancharlo:** todos los lugares donde hoy hay un título — Feed Social,
Explorador, Cola Editorial, Radar, y las tablas de drill-down de Gestión y
Liderazgos. El mismo componente en los seis.

---

## Reparto con el segundo modelo (3.8 high)

Mismo criterio que la vez pasada — **por si el error se ve o no se ve**:

- **3.8 high:** C punto 1 y 2 (qué entra al pipeline editorial y qué se guarda
  cuando no hay título: un error acá produce piezas sobre publicaciones que no
  son noticias, y nadie lo detecta mirando la pantalla), y las consultas SQL
  que alimentan los bloques de D.
- **Modelo principal:** A, B, C punto 3, y todo el maquetado del popup.
  Feedback inmediato y visual.
- Ninguno revisa lo suyo. Las 347 pruebas corren antes de cada commit.

## Lo que sigue pendiente de antes

1. **`SECRET_KEY`** — confirmá que quedó fuera del código, con un valor nuevo
   generado, y que la contraseña de admin se rotó. Si no está hecho, es lo
   primero.
2. **`exactitud léxica 18.96%`** en el log del archivo histórico. Es muy bajo:
   la medición honesta de la taxonomía dio 74,2%. O el job compara contra un
   campo que no es la sección real, o el léxico no cubre el vocabulario de 2018.
   Averiguá cuál de las dos antes de usar esos baselines para calibrar umbrales
   — si el número es correcto, los cuantiles empíricos están construidos sobre
   clasificaciones equivocadas.
3. **El plan sigue siendo el gratuito de Gemini Lite.** No se cambia.

## Qué devolver

- `python -m pytest tests/ -q`
- Captura de la consola con los cuatro colores visibles.
- Captura del popup en un caso donde un bloque diga por qué no está disponible.
- Una publicación de FM del Lago que antes mostraba una cadena base62 y ahora
  muestra el texto, marcada como "sin título".
- La cola editorial de dos días seguidos, mostrando que no repite ninguna pieza.
