# Decisiones de arquitectura: respuesta a los cinco dilemas

Sobre la auditoría forense de septiembre de 2026 —120 notas y 120 publicaciones
contrastadas contra la base—. Cada dilema tiene una decisión, no un menú.

Antes de los cinco, el hallazgo que obliga a rediseñar algo mío.

---

## 0. El dato que cambia el diseño: 1,1 comentarios por publicación

```
0 comentarios        56,7%
1 comentario         13,3%
2 a 4 comentarios    20,8%
5 o más               9,2%   ← lo único que veía la Ruta A
```

Todo el aparato de medición de reacción de este sistema —Wilson, saldo, RTC con
shrinkage bayesiano, mínimo de 30 reacciones valorables— **está calibrado para
volúmenes que en Esquel no existen**. Es un error mío y no es de umbral: es de
instrumento.

La tentación es bajar el corte de 5 comentarios a 2. No sirve, y el intervalo de
Wilson lo dice sin ambigüedad:

| n | positivos | centro | piso | ancho del intervalo |
|---|---|---|---|---|
| 1 | 1/1 | 0,60 | 0,21 | **0,40** |
| 3 | 2/3 | 0,57 | 0,21 | 0,37 |
| 40 | 32/40 | 0,77 | 0,65 | 0,12 |

Con un comentario la incertidumbre es de **40 puntos porcentuales**. Bajar el
umbral no produce mediciones: produce las mismas no-mediciones con menos aviso
de que lo son.

### La corrección: dos instrumentos, no uno

**Por publicación — densidad testimonial, no volumen.** Un comentario que dice
*«hace seis días que no sube la máquina a mi calle»* vale más que cuarenta que
dicen *«qué bien»*. El primero tiene lugar, plazo y es verificable; los otros
cuarenta son cortesía. **Dos testimonios concretos son un dato**, y son mucho
más frecuentes que veinte comentarios.

Esto no es una concesión al volumen bajo: es mejor periodismo. Un reclamo con
dirección es reporteable; un pico de likes no.

**Por tema y ventana — ahí sí hay masa estadística.** Lo que no se puede hacer
sobre un post se puede hacer sobre un mes. La propia auditoría encontró que
servicios básicos concentra el 34,2% de la conversación con el 8,5% de la
cobertura. Ese número es sólido: sale de cientos de comentarios acumulados.

Así que **la Ruta A deja de ser un filtro por publicación y pasa a ser un radar
temático**. No decide qué post publicar: decide qué tema hay que ir a buscar —
que es lo que hace una redacción.

Está en `app/core/senal_civica.py`, con 16 pruebas.

---

## Dilema 1 — Ingesta de Red 43

**Decisión: ninguna de las dos alternativas. Usar el sitemap que ya existe.**

Red 43 no es WordPress, así que la Alternativa B (API REST) no aplica; y pedir
acceso a su base crea una dependencia que se rompe el día que cambien de
hosting. La Alternativa A (Playwright sobre la portada) es innecesariamente
frágil: descubrir notas parseando el HTML de una home es reinventar lo que el
sitio ya publica.

Red 43 tiene **`sitemaps_last.xml`**, que es exactamente el índice de lo
publicado recientemente. Ya está en `medios.py` y en `config.py`.

```
descubrimiento  →  sitemaps_last.xml     (estable, es un contrato del sitio)
extracción      →  HTML de cada /nota/   (única parte frágil)
```

Así Red 43 queda bajo el mismo contrato que los otros tres: descubrimiento por
índice, extracción por medio. El DOM sólo se toca para sacar el cuerpo, que es
donde no queda otra.

### Lo que importa más que el scraper

```python
def ingerir_red43_archivo():
    if cnt > 0:
        return 0      # ← "0 notas nuevas", que el daemon lee como éxito
```

Esto no es un scraper faltante: es **un proceso que reporta éxito mientras no
hace nada**. Y el semáforo se pone verde, porque no hubo excepción.

Corregimos que un semáforo se escribiera en bloque. Falta la otra mitad:

> **Un proceso no reporta que terminó. Reporta cuánto cubrió.**

Concreto: cada job de ingesta escribe `notas_vistas` y `notas_nuevas` en
`estado_procesos`. Si un medio publicó 30 notas en 48 h y el sistema vio 2,
el semáforo va a **rojo** aunque el script haya salido con código 0. Sin eso, la
consola seguirá diciendo que todo anda mientras el portal insignia está
desconectado.

---

## Dilema 2 — Calibración de la Ruta A

**Decisión: la Alternativa B, con una corrección.**

La intuición de ustedes es correcta —el valor testimonial supera al volumen—
pero la formulación propuesta mezcla dos cosas que conviene separar: las
reacciones negativas y las palabras clave de reclamo.

La razón: **`angry` y `sad` no son lo mismo**, y ya lo aprendimos. En la comarca
`sad` se usa masivamente para fallecimientos y accidentes. Meterlo en un índice
de tensión cívica reproduce el falso positivo que `polisemia.py` vino a
resolver: una tragedia da saldo −0,90 y dispara la alerta de crisis de gestión.

La formulación que sí funciona no necesita el volumen:

```
señal = f(testimonios concretos)     y no     f(comentarios, reacciones)
```

- **2 testimonios** → señal. Dos personas distintas reportando el mismo hecho
  con lugar y plazo es lo que un cronista llamaría «me llegaron dos llamados por
  lo mismo».
- **1 testimonio + más de la mitad del hilo en rechazo** → señal. No es el
  testimonio solo: es el testimonio en un hilo que le da la razón.
- **Percentil ≥ 97 de la comarca** (unos 8+ comentarios) → señal por volumen,
  como excepción. A esa altura el volumen es en sí mismo el hecho.

Los testimonios ya los detecta `comentarios.clasificar_comentario`. No hace
falta un léxico nuevo de «barro / intransitable / vergüenza»: eso es tono, y el
tono no es un hecho.

**Y lo que hay que mostrar en pantalla**: `cobertura_de_medicion()` devuelve qué
proporción de las publicaciones admite una proporción. Sobre los datos reales da
**9%**. Un tablero que muestre saldos en el 100% está inventando en el 91% de
los casos, y eso tiene que estar a la vista y no en una nota al pie.

---

## Dilema 3 — ¿`post_id` o suceso?

**Decisión: migrar al suceso, pero de forma aditiva.**

La evidencia es concluyente: 82,5% de los posts sin `note_id`, Red 43 con 0% de
emparejamiento, y el mismo hecho apareciendo en cuatro medios. Mantener
`post_id` como raíz significa que la unidad del sistema es *una publicación de
Facebook*, que es un accidente de distribución y no una unidad de la realidad.

Pero **no es una migración grande**, y no hay que hacerla de golpe:

```sql
CREATE TABLE IF NOT EXISTS suceso (
    id          INTEGER PRIMARY KEY,
    clave       TEXT UNIQUE NOT NULL,   -- slug del hecho
    titulo      TEXT NOT NULL,          -- el del medio que mejor lo tituló
    fecha       TEXT NOT NULL,
    escala      TEXT,                   -- de ambito.py
    issue       TEXT,
    creado_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS suceso_fuente (
    suceso_id   INTEGER NOT NULL REFERENCES suceso(id),
    tipo        TEXT NOT NULL,          -- 'web' | 'facebook'
    ref_id      TEXT NOT NULL,          -- note_id o post_id
    medio       TEXT NOT NULL,
    metodo      TEXT NOT NULL,          -- 'url' | 'texto' | 'manual'
    confianza   REAL,
    PRIMARY KEY (suceso_id, tipo, ref_id)
);
```

`notas_web` y `social_posts` no se tocan. La `pieza` pasa a apuntar al `suceso`.
El agrupamiento ya está escrito: `seleccion_editorial.agrupar_por_evento()` con
`UMBRAL_MISMO_EVENTO`.

### Por qué esto además resuelve el problema del Dilema 2

Un suceso cubierto por cuatro medios agrega **cuatro hilos de comentarios**.
4 × 1,1 = 4,4 en vez de 1,1. Sigue siendo poco para un porcentaje, pero es
cuatro veces más testimonios — y es la agregación correcta, porque es el mismo
hecho.

**El suceso no es sólo un modelo más limpio: es la única forma de sacar masa
estadística de una comunidad chica.** Ese es el argumento decisivo, no la
elegancia.

Y `suceso_fuente.metodo` conserva la distinción que ya defendimos: un vínculo
`texto` presta el cuerpo y el título; sólo `url` habilita atribuir métricas.

---

## Dilema 4 — FTS5 al día

**Decisión: job incremental, no trigger. Y arreglar el `except` primero.**

El trigger tiene un problema que su propio documento anticipa —las notas se
insertan antes de limpiarse— pero hay uno peor: **un trigger indexa también lo
que no sirve**. Las dos notas de Red 43 que están en la base tienen
`cuerpo = ''`; un trigger las indexaría igual y el buscador devolvería
resultados vacíos que nadie puede distinguir de resultados malos.

Un job puede filtrar, es idempotente y se puede volver a correr:

```sql
INSERT OR REPLACE INTO archivo_fts (note_id, titulo, cuerpo)
SELECT note_id, titulo, cuerpo
  FROM notas_web
 WHERE length(trim(cuerpo)) >= 200
   AND note_id NOT IN (SELECT note_id FROM archivo_fts);
```

Y que reporte cuántas indexó, para el semáforo del Dilema 1.

### Pero antes que eso: el `except` que miente

```python
try:
    candidatas = [dict(r) for r in filas]
except Exception:
    candidatas = []          # ← indistinguible de "no hay antecedentes"
```

Poner `row_factory` arregla *este* caso. Lo que hay que sacar es el patrón: un
`except` que devuelve vacío convierte cualquier error futuro en «el archivo no
registra antecedentes». Es la tercera vez que aparece la misma forma —el
`except: pass` de los KPI, el semáforo escrito en bloque, esto—, y siempre con
la misma consecuencia: **el sistema informa ausencia de datos cuando lo que hay
es una falla**.

La regla: si falla, que falle ruidosamente y quede en `eventos_sistema`. Un
error visible cuesta una tarde; uno silencioso cuesta meses de decisiones
tomadas sobre datos que no estaban.

---

## Dilema 5 — Persistencia por formato

**Decisión: una tabla con discriminador y validación en la escritura.**

Tablas separadas por formato multiplican el código de ciclo de vida —estados,
revisor, trigger— sin ganar nada. Lo que falta no es separación física: es
**que el backend verifique que el contenido corresponde al formato**.

```python
ESQUEMAS = {
    "hilo":     {"requiere": ["tuits"],   "prohibe": ["escenas", "slides"]},
    "reel":     {"requiere": ["escenas"], "prohibe": ["tuits", "slides"]},
    "reel_largo": {"requiere": ["escenas"], "prohibe": ["tuits", "slides"]},
    "carrusel": {"requiere": ["slides"],  "prohibe": ["tuits", "escenas"]},
    "placa":    {"requiere": ["texto"],   "prohibe": ["escenas", "tuits"]},
}
```

Con eso, el bug que llenó la base de hilos guardados como guiones de 25,5
segundos se habría rechazado en el `POST`, no descubierto tres semanas después
leyendo filas. **El frontend puede tener bugs; la base no debería aceptarlos.**

En el frontend, tres estados separados —`guionActual`, `hiloActual`,
`carruselActual`— y que `guardarDerivadaActual()` elija según la pestaña activa.
Ese es el parche de la Alternativa A, y alcanza: el rediseño completo del Taller
puede venir después.

---

## Lo que no está en los dilemas y es igual de importante

### La nota de portal enana

209 caracteres publicados como nota. `nota_portal.revisar()` **ya avisa** que
por debajo de 900 no justifica una URL, pero es una advertencia y no bloquea.

No hay que estirar el texto automáticamente —tres párrafos que dicen lo mismo
son peores que la nota corta—. Lo que hay que hacer es **darle más material**:
hoy `redactar()` recibe la pieza (400 caracteres) y no el cuerpo de la nota web
(1.450 de promedio en Canal 4). Con el cuerpo original más el contexto del
archivo, 1.500 caracteres salen solos y sin inventar nada.

### Las micro-escenas de 2,5 segundos

`guion_video()` arma una escena por cada elemento de `hechos`, y los hechos son
frases nominales de cuatro palabras. Una escena de 2,5 segundos que dice
«repaso de calle Fontana» no es locutable.

Corrección: **una escena por bloque narrativo, no por hecho**. Los tres actos
que ustedes proponen —gancho, hecho contrastado, pregunta— están bien; lo que
falta es agrupar los hechos dentro del acto 2 en una oración, en vez de una
escena cada uno.

### Los temas que caen en zonas grises

Los tres que señalan son correctos y ninguno está en la taxonomía:

- **Comunidades originarias** — Zomo Kimun, Nahuelpan, comunidades
  mapuche-tehuelche. Merece macro-eje propio, no caer en «cultura».
- **Prevención de incendios** — hoy sólo califica el incendio consumado. El
  debate presupuestario de octubre es cuando importa.
- **Cooperativa 16 de Octubre** — es el actor con más impacto cotidiano en
  Esquel y no está en el registro.

Los tres son una tarde de trabajo en `issues_esquel.py` y `actores.py`, y
valen más que cualquier ajuste de umbral.

---

## Orden de ejecución

La matriz de cuatro fases está bien ordenada salvo por una cosa: **el suceso
tiene que ir antes que el worker de piezas**, no después. Si el worker se
escribe contra `post_id` hay que reescribirlo cuando llegue el suceso.

```
1. Cobertura en los semáforos + Red 43 por sitemap + el except del FTS5
2. Tabla suceso (aditiva) + reindexado incremental
3. Worker cola → pieza, escrito contra suceso
4. senal_civica reemplazando el filtro de Ruta A
5. Taller: contrato del POST, editor real, validación por formato
6. Nota larga con cuerpo web + escenas agrupadas
7. Taxonomía: originarios, incendios, cooperativa
```

Lo primero es lo que hace visible todo lo demás. Mientras la consola diga que
la ingesta está sana con el 93% de Red 43 afuera, cualquier otra medición del
sistema está construida sobre un hueco que nadie ve.
