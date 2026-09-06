# Prompt para Antigravity — Guillotina v15

> Copiá todo lo que sigue. Va junto con `decisiones-arquitectura-v15.pdf`, que
> tiene el razonamiento completo de cada decisión.

---

La auditoría de los cinco documentos es el mejor trabajo que hiciste hasta
ahora. Salir a raspar 120 notas y 120 posts en vivo para contrastar contra la
base es exactamente lo que hacía falta, y encontró algo que ninguna revisión de
código podía encontrar.

**El dato de 1,1 comentarios por publicación invalida un supuesto central de mi
diseño.** Wilson, saldo, RTC con shrinkage, mínimo de 30 reacciones valorables:
todo calibrado para volúmenes que en Esquel no existen. Es un error mío, y lo
corregí.

Van las cinco decisiones. El razonamiento largo está en
`docs/arquitectura/10-decisiones-de-arquitectura.md`, ya en la rama.

```bash
git fetch origin claude/taxonomia-v4 && git rebase origin/claude/taxonomia-v4
python -m pytest tests/ -q --ignore=tests/test_facebook_worker.py   # 508
```

---

# 0 — Antes de los dilemas: por qué bajar el umbral no sirve

La tentación obvia es pasar de «≥5 comentarios» a «≥2». No alcanza, y el
intervalo de Wilson lo dice:

| n | positivos | centro | piso | ancho |
|---|---|---|---|---|
| 1 | 1/1 | 0,60 | 0,21 | **0,40** |
| 3 | 2/3 | 0,57 | 0,21 | 0,37 |
| 40 | 32/40 | 0,77 | 0,65 | 0,12 |

Con un comentario la incertidumbre es de 40 puntos porcentuales. Bajar el corte
no produce mediciones: produce las mismas no-mediciones con menos aviso.

**Hay que cambiar el instrumento, no el umbral.** Está en
`app/core/senal_civica.py`, con 16 pruebas.

---

# DILEMA 1 — Red 43

**Decisión: ninguna de tus dos alternativas. El sitemap que ya existe.**

Red 43 no es WordPress (la Alternativa B no aplica), y parsear la portada con
Playwright es reinventar lo que el sitio ya publica. **`sitemaps_last.xml`** es
exactamente el índice de lo publicado recientemente, y ya está en `medios.py` y
`config.py`.

```
descubrimiento  →  sitemaps_last.xml      contrato del sitio, estable
extracción      →  HTML de cada /nota/    única parte frágil
```

Mismo contrato que los otros tres.

## Lo que importa más que el scraper

```python
if cnt > 0:
    return 0      # "0 notas nuevas" — el daemon lo lee como éxito
```

Eso no es un scraper faltante: es **un proceso que reporta éxito mientras no
hace nada**. Arreglamos que el semáforo se escribiera en bloque; falta la otra
mitad:

> **Un proceso no reporta que terminó. Reporta cuánto cubrió.**

Cada job de ingesta escribe `notas_vistas` y `notas_nuevas` en
`estado_procesos`. Si un medio publicó 30 notas en 48 h y el sistema vio 2, el
semáforo va a **rojo** aunque el script haya salido con código 0.

Sin eso, la consola va a seguir diciendo que todo anda mientras el portal
insignia está desconectado. Es lo primero de todo el plan.

---

# DILEMA 2 — Ruta A

**Decisión: tu Alternativa B, con una corrección.**

La intuición es correcta. La formulación que proponés mezcla dos cosas que
conviene separar, y una es peligrosa: **`angry` y `sad` no son lo mismo**. En la
comarca `sad` se usa para fallecimientos y accidentes; meterlo en un índice de
tensión cívica reproduce el falso positivo que `polisemia.py` vino a resolver —
una tragedia da saldo −0,90 y dispara la alerta de crisis de gestión.

La formulación que funciona no necesita el volumen:

```python
from app.core import senal_civica as sc

s = sc.evaluar_publicacion(comentarios, testimonios, rechazo, reacciones)
# s.tipo ∈ testimonial | volumen | ninguna
# s.fuerza, s.percentil, s.motivo, s.medible
```

- **2 testimonios** → señal. Dos personas distintas reportando el mismo hecho
  con lugar y plazo.
- **1 testimonio + más de la mitad del hilo en rechazo** → señal. No es el
  testimonio solo: es el testimonio en un hilo que le da la razón.
- **Percentil ≥ 97** (unos 8 comentarios) → señal por volumen, como excepción.

Los testimonios ya los detecta `comentarios.clasificar_comentario`. **No hace
falta un léxico nuevo de «barro / intransitable / vergüenza»**: eso es tono, y
el tono no es un hecho.

## El radar temático

```python
brechas, motivo = sc.brechas_por_tema(notas_por_tema, comentarios_por_tema)
desatendidos = sc.temas_desatendidos(brechas)
```

Acá sí hay estadística, porque se acumula. Tu propio hallazgo —servicios
básicos, 34,2% de conversación con 8,5% de cobertura— sale sólido de esta
función. Va como pestaña, no como filtro: **dice dónde mirar, no qué publicar**.

## Y esto en pantalla

```python
sc.cobertura_de_medicion(publicaciones)
# sobre datos reales: prop_medibles = 9%
```

Un tablero que muestre saldos en el 100% de las publicaciones está inventando
en el 91% de los casos. Tiene que estar a la vista, no en una nota al pie.

## Lo que hay que sacar

`umbral_realista()` reemplaza el baseline con piso absoluto. El error era
combinar un percentil móvil con un mínimo de 30 reacciones: un p75 de un medio
cuya mediana es 4 interacciones vale 8, y el piso lo subía a 30. **Si hace falta
un piso, que sea sobre la muestra —¿tengo datos para calcular el percentil?— y
no sobre el valor.**

---

# DILEMA 3 — `post_id` o suceso

**Decisión: migrar al suceso, de forma aditiva.**

82,5% de posts sin `note_id`, Red 43 con 0%, y el mismo hecho en cuatro medios.
Mantener `post_id` como raíz significa que la unidad del sistema es *una
publicación de Facebook* — un accidente de distribución, no una unidad de la
realidad.

```sql
CREATE TABLE IF NOT EXISTS suceso (
    id        INTEGER PRIMARY KEY,
    clave     TEXT UNIQUE NOT NULL,
    titulo    TEXT NOT NULL,
    fecha     TEXT NOT NULL,
    escala    TEXT,                  -- de ambito.py
    issue     TEXT,
    creado_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS suceso_fuente (
    suceso_id INTEGER NOT NULL REFERENCES suceso(id),
    tipo      TEXT NOT NULL,         -- 'web' | 'facebook'
    ref_id    TEXT NOT NULL,         -- note_id o post_id
    medio     TEXT NOT NULL,
    metodo    TEXT NOT NULL,         -- 'url' | 'texto' | 'manual'
    confianza REAL,
    PRIMARY KEY (suceso_id, tipo, ref_id)
);
```

`notas_web` y `social_posts` **no se tocan**. La `pieza` pasa a apuntar al
suceso. El agrupamiento ya existe: `seleccion_editorial.agrupar_por_evento()`.

## Por qué esto además resuelve el Dilema 2

Un suceso cubierto por cuatro medios agrega **cuatro hilos**: 4 × 1,1 = 4,4 en
vez de 1,1. Sigue siendo poco para un porcentaje, pero es cuatro veces más
testimonios — y es la agregación correcta, porque es el mismo hecho.

**El suceso no es sólo un modelo más limpio: es la única forma de sacar masa
estadística de una comunidad chica.** Ése es el argumento, no la elegancia.

Y `suceso_fuente.metodo` conserva la distinción de v14: `texto` presta el cuerpo
y el título, sólo `url` habilita atribuir métricas.

---

# DILEMA 4 — FTS5

**Decisión: job incremental, no trigger. Y el `except` primero.**

Tu propio «contras» del trigger es correcto, pero hay uno peor: **un trigger
indexa también lo que no sirve**. Las dos notas de Red 43 que están en la base
tienen `cuerpo = ''`; un trigger las indexaría igual y el buscador devolvería
vacíos indistinguibles de resultados malos.

```sql
INSERT OR REPLACE INTO archivo_fts (note_id, titulo, cuerpo)
SELECT note_id, titulo, cuerpo
  FROM notas_web
 WHERE length(trim(cuerpo)) >= 200
   AND note_id NOT IN (SELECT note_id FROM archivo_fts);
```

Que reporte cuántas indexó, para el semáforo del Dilema 1.

## Pero antes: el `except` que miente

```python
except Exception:
    candidatas = []      # indistinguible de "no hay antecedentes"
```

`row_factory` arregla *este* caso. Lo que hay que sacar es **el patrón**. Es la
tercera vez que aparece la misma forma —el `except: pass` de los KPI, el
semáforo escrito en bloque, esto— y siempre con la misma consecuencia: el
sistema informa ausencia de datos cuando lo que hay es una falla.

Si falla, que falle ruidosamente y quede en `eventos_sistema`. Un error visible
cuesta una tarde; uno silencioso cuesta meses de decisiones tomadas sobre datos
que no estaban.

**Buscá y corregí todos los `except` que devuelven vacío en el repo.**

---

# DILEMA 5 — Persistencia por formato

**Decisión: una tabla con discriminador y validación en la escritura.**

Tablas separadas multiplican el código de ciclo de vida sin ganar nada. Lo que
falta no es separación física: es que el backend **verifique que el contenido
corresponde al formato**.

```python
ESQUEMAS = {
    "hilo":       {"requiere": ["tuits"],   "prohibe": ["escenas", "slides"]},
    "reel":       {"requiere": ["escenas"], "prohibe": ["tuits", "slides"]},
    "reel_largo": {"requiere": ["escenas"], "prohibe": ["tuits", "slides"]},
    "carrusel":   {"requiere": ["slides"],  "prohibe": ["tuits", "escenas"]},
    "placa":      {"requiere": ["texto"],   "prohibe": ["escenas", "tuits"]},
}
```

Con eso, el bug que llenó la base de hilos guardados como guiones de 25,5
segundos se habría rechazado en el `POST`, no descubierto tres semanas después
leyendo filas. **El frontend puede tener bugs; la base no debería aceptarlos.**

En el frontend: tres estados separados (`guionActual`, `hiloActual`,
`carruselActual`) y que `guardarDerivadaActual()` elija según la pestaña. Es tu
Alternativa A y alcanza — el rediseño completo puede venir después.

---

# LO QUE NO ESTÁ EN LOS DILEMAS Y ES IGUAL DE IMPORTANTE

## La nota de 209 caracteres

`nota_portal.revisar()` **ya avisa** que por debajo de 900 no justifica una URL,
pero avisa y no bloquea.

**No la estires automáticamente.** Tres párrafos que dicen lo mismo son peores
que la nota corta: el lector se da cuenta y a partir de ahí lee todo con
desconfianza.

Lo que hay que hacer es **darle más material**. Hoy `redactar()` recibe la pieza
(400 caracteres) y no el cuerpo de la nota web (1.450 de promedio en Canal 4).
Con el cuerpo original más el contexto del archivo, 1.500 caracteres salen solos
y sin inventar nada.

## Las micro-escenas de 2,5 segundos

Tenés razón y la causa es mía: `guion_video()` arma **una escena por cada
elemento de `hechos`**, y los hechos son frases nominales de cuatro palabras.

Corrección: **una escena por bloque narrativo, no por hecho**. Los tres actos
que proponés están bien; lo que falta es agrupar los hechos dentro del acto 2 en
una oración corrida, en vez de una escena cada uno.

## Los tres temas en zona gris

Los tres que señalás son correctos y ninguno está en la taxonomía:

- **Comunidades originarias** — Zomo Kimun, Nahuelpan, comunidades
  mapuche-tehuelche. Merece macro-eje propio, no caer en «cultura».
- **Prevención de incendios** — hoy sólo califica el incendio consumado. El
  debate presupuestario de octubre es cuando importa.
- **Cooperativa 16 de Octubre** — el actor con más impacto cotidiano en Esquel
  y no está en el registro.

Una tarde en `issues_esquel.py` y `actores.py`, y vale más que cualquier ajuste
de umbral.

---

# ORDEN DE EJECUCIÓN

Tu matriz de fases está bien salvo por una cosa: **el suceso va antes que el
worker de piezas**, no después. Si el worker se escribe contra `post_id` hay
que reescribirlo cuando llegue el suceso.

```
1. Cobertura en los semáforos + Red 43 por sitemap + el except del FTS5
2. Tabla suceso (aditiva) + reindexado incremental
3. Worker cola → pieza, escrito contra suceso
4. senal_civica reemplazando el filtro de Ruta A
5. Taller: contrato del POST, editor real, validación por formato
6. Nota larga con cuerpo web + escenas agrupadas
7. Taxonomía: originarios, incendios, cooperativa
```

Lo primero es lo que hace visible todo lo demás. Mientras la consola diga que la
ingesta está sana con el 93% de Red 43 afuera, cualquier otra medición está
construida sobre un hueco que nadie ve.

---

# INVARIANTES

1. Gemini Lite gratuito.
2. Nada se publica sin revisor, y nada con bloqueante se publica aunque haya
   revisor.
3. Maduración: 6 h mínimo, 48 h máximo.
4. Todo texto publicable pasa por `verificar_texto()`.
5. Un dato ausente se guarda como `NULL` y no cuenta como evidencia en contra.
6. Un semáforo se gana, no se escribe — **y ahora: se gana por cobertura, no
   por terminar sin excepción**.
7. Ante la duda con un nombre, se bloquea; no se reescribe.
8. **Ningún `except` devuelve vacío en silencio.**
9. Nada de evasión de detección.

# QUÉ DEVOLVER

1. `pytest` y confirmación de push.
2. **D1:** conteo de notas de Red 43 en la base tras el sitemap, y un semáforo
   en rojo por cobertura baja provocado a propósito.
3. **D2:** cuántas publicaciones dan señal testimonial en 30 días, y el
   `cobertura_de_medicion` real mostrado en el tablero.
4. **D3:** la tabla `suceso` poblada, con un caso cubierto por 3+ medios y sus
   comentarios agregados.
5. **D4:** la lista de `except` que devolvían vacío, y cuántas notas de 2026
   quedaron indexadas.
6. **D5:** un `POST` con formato `hilo` y contenido de `escenas`, rechazado.
