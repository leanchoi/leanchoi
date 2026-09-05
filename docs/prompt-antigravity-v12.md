# Prompt para Antigravity — Guillotina v12

> Copiá todo lo que sigue. Es autocontenido.

---

# ANTES DE EMPEZAR: dos cosas

**1. Tu commit de v11 no está en GitHub.** El walkthrough menciona `3eb48f2`,
pero `origin/claude/taxonomia-v4` no lo tiene: la rama sólo tiene los commits
de `app/core/`. Tu trabajo vive en `/opt/red43_allsite` del VPS y nada más.
Pusheálo antes de tocar nada — si el VPS se pierde, se pierde todo.

**2. Traé la rama y verificá la base:**

```bash
git fetch origin claude/taxonomia-v4 && git rebase origin/claude/taxonomia-v4
python -m pytest tests/ -q --ignore=tests/test_facebook_worker.py   # 459
```

Hay **seis módulos nuevos** en `app/core/` listos para conectar, **un bug de
cálculo corregido** que explica un resultado tuyo, y **tres defectos** vistos
en el tablero. Nada pide inventar lógica.

---

# A — La correlación devolvía cero citables (bug mío, ya corregido)

Tu corrida sobre «repaso de calle Fontana» devolvió siete antecedentes y
**ninguno citable**, incluido «Mantenimiento Urbano: Realizan trabajos en Av.
Fontana y Av. Alvear», que es exactamente el antecedente que se busca.

No era tu integración. Era el scoring de `contexto_historico.py`:

`mismo issue` valía **0,40 de un máximo de 1,10**, y `enriched_articles` no
tiene el campo cargado. Con el issue siempre vacío el techo real quedaba en
0,66 y el umbral de «directo» en 0,62 — nada podía llegar.

Ahora cada dimensión aporta la fracción que logró de lo que se le podía pedir,
y el puntaje se normaliza sobre las que **de verdad se pudieron evaluar**.
Sobre tus mismos casos:

```
misma calle, misma obra      0.865  directo
misma calle, mismo repaso    0.901  directo
otro barrio, misma obra      0.296  descartado
otra ruta                    0.000  descartado
nota genérica                0.000  descartado
otro tema                    0.000  descartado
```

**Lo que tenés que hacer:** volvé a correr la búsqueda de antecedentes con el
módulo actualizado y mostrame el resultado. Debería haber citables ahora.

**Y esto además:** poblá `enriched_articles.issue` con `issues_esquel`. El
campo existe y está vacío; con él cargado la correlación mejora bastante más.

---

# B — El sistema hablaba de sí mismo (el problema más importante)

El Taller producía esta bajada, y de ahí salía al guion de video **y a la placa
de Instagram**:

> «De 10 comentarios analizados en Canal 4 Esquel, los testimonios señalan la
> falta de intervención de Trabajo.»

Ahí hay tres cosas que no le importan a nadie afuera del sistema —cuántos
comentarios miramos, que los «analizamos», de qué página salieron— y una que sí
—que Trabajo no intervino— enterrada al final.

**El problema no es que aburre: traslada la duda.** El lector pasa de pensar en
la planta a preguntarse si diez comentarios alcanzan.

Y no era un caso aislado: la placa de cierre de La Bronca —la que va a
Instagram, la más compartida de todas— decía *«…reportaron lo mismo en los
comentarios de {medio} del {fecha}»*. Ya está corregido en `voces.derivar`.

## Lo que ya está hecho

- `limites_editoriales.filtraciones_de_metodo()` lo marca como **violación**,
  no advertencia. Ya está dentro de `verificar_texto()`, así que todo lo
  publicable lo hereda.
- `voces.derivar` corregido.
- Dos fixtures míos codificaban la mala práctica como correcta. Reescritos.

## Lo que falta hacer

1. **Arreglar el generador de la pieza.** La bajada la produce
   `sintesis_gemini` / `gacetilla` con la plantilla «De N comentarios en X…».
   Cambiala para que la bajada diga **qué pasó**. El prompt del modelo tiene
   que prohibirlo explícitamente.

2. **Mover el dato al pie.** No se borra: va a la ficha de transparencia, donde
   suma credibilidad en vez de restarla. `nota_portal.ficha_transparencia()` la
   arma:

   > *Reacción medida sobre la publicación de Canal 4 Esquel del 2026-09-04 ·
   > 10 comentarios leídos · 340 reacciones · cobertura 62% del hilo.*

3. **Regenerar las piezas existentes** que tengan la fuga, o marcarlas para
   revisión. Las que están en la base salieron con la bajada vieja.

---

# C — La nota del portal (lo que faltaba en el Taller)

El Taller muestra la pieza y las derivadas, pero **no el texto largo que va a
poblar el portal**. La pieza son 400 caracteres para decidir si el tema vale;
la nota son 2.000 para que alguien que no sabía nada lo entienda.

Módulo: **`app/core/nota_portal.py`**.

```python
from app.core.nota_portal import redactar, lista_para_publicar

nota = redactar(pieza, testimonios=[...], antecedentes=[...], contexto="...")
lista, avisos = lista_para_publicar(nota)
```

Devuelve `volanta, titulo, bajada, parrafos, destacado, contexto, que_queda,
ficha, etiquetas, slug, caracteres, lectura_minutos, advertencias`.

**El orden de los párrafos no es estilo**, es una decisión sobre qué sostiene
qué: el hecho primero porque es lo verificable, la reacción después porque se
apoya en él, el antecedente al final porque les da sentido a los dos. Empezar
por la reacción produce una nota sobre el enojo en vez de una nota sobre lo que
pasó. No lo reordenes.

**Las advertencias avisan, no corrigen.** Una nota corta se arregla
reporteando, no estirando el texto: tres párrafos que dicen lo mismo con otras
palabras son peores que la nota corta, porque el lector se da cuenta y a partir
de ahí lee todo con desconfianza.

**Tabla nueva:**

```sql
CREATE TABLE IF NOT EXISTS nota_portal (
    id           INTEGER PRIMARY KEY,
    pieza_id     TEXT NOT NULL REFERENCES pieza(id),
    slug         TEXT NOT NULL UNIQUE,
    volanta      TEXT, titulo TEXT NOT NULL, bajada TEXT,
    cuerpo       TEXT NOT NULL,
    destacado    TEXT, contexto TEXT, que_queda TEXT, ficha TEXT,
    etiquetas    TEXT,
    estado       TEXT NOT NULL DEFAULT 'borrador',
    revisor      TEXT, revisada_at TEXT, publicada_at TEXT,
    creada_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TRIGGER IF NOT EXISTS trg_nota_requiere_revisor
BEFORE UPDATE OF estado ON nota_portal
WHEN NEW.estado = 'publicada' AND (NEW.revisor IS NULL OR NEW.revisor = '')
BEGIN
    SELECT RAISE(ABORT, 'una nota no se publica sin revisor humano');
END;
```

En el Taller: bloque «La Nota», arriba de las derivadas, con botón de copiar y
las advertencias visibles.

---

# D — Configuración editorial dentro del Taller

Hoy los `.md` que definen la voz sólo se cambian abriendo un editor en el
servidor, y los cupos de la cola sólo tocando código. Quien tiene que ajustar
eso es quien edita, no quien programa.

Módulo: **`app/core/config_editorial.py`**.

## D.1 — Los archivos de criterio

```python
from app.core import config_editorial as ce

ce.listar_archivos()          # los 13 .md con título, descripción y estado
ce.leer("01-pulso.md")
ce.guardar("01-pulso.md", texto, autor="leandro")
```

`guardar()` deja copia de la versión anterior en `editorial/.versiones/`. No es
paranoia: son el criterio del medio, se editan a mano y a veces con apuro.
Poder volver a la de ayer es la diferencia entre un cambio y un accidente.

**`_ruta_segura()` valida que la ruta caiga dentro de `editorial/`.** No la
saltees: sin eso, un `../../etc/passwd` en el nombre deja escribir en cualquier
lado del servidor desde un formulario del tablero.

Editor de texto plano con vista previa de Markdown. No hace falta más.

Se agregaron dos archivos nuevos: `05-viralidad.md` (los criterios de alcance) y
`06-nota-portal.md` (cómo se escribe la nota larga).

## D.2 — Los cupos de la cola

```python
cfg = ce.config_por_defecto()     # 4 por día, tres franjas
errores = ce.validar(cfg)         # lista vacía = se puede guardar
```

Editable: `cupo_diario`, `max_por_medio`, `max_por_angulo`, las franjas
(nombre, hora, cupo), `exigencia`, y las horas de maduración.

**Cada límite tiene rango y motivo en `ce.LIMITES`. Mostrá el motivo en la
interfaz cuando falla la validación**, no un «valor inválido». Un cupo de 40
por día no rompe nada: produce cuarenta gacetillas mediocres, y para cuando se
nota ya se publicaron.

Los cupos de las franjas tienen que sumar el cupo diario. La validación lo
verifica.

## D.3 — Lo que no se configura

`ce.NO_CONFIGURABLE` tiene cinco entradas con su motivo. **Mostralas en la
misma pantalla**, en una sección aparte y en gris: revisión humana,
verificación de límites, seudonimización, etiqueta de IA, mínimos de evidencia.

Que se vean —y que no se puedan tocar— es parte del punto. Una config que las
expone las convierte en negociables el día que alguien tenga apuro.

---

# E — Filtrado geográfico en todas las pestañas

En el mismo feed conviven «Repasaron la calle Fontana» y «Sanciones a
petroleras en Malvinas». Las dos son noticias y no son la misma clase de cosa,
y mezclarlas rompe todas las mediciones: el saldo de una nota nacional mide el
humor político argentino, no la gestión municipal.

Módulo: **`app/core/ambito.py`**.

```python
from app.core import ambito

a = ambito.clasificar(titulo, texto, macro_eje)
# a.escala ∈ esquel | comarca | provincial | nacional | internacional | sin_determinar
# a.confiable, a.senales, a.motivo
```

**Gana la escala más chica.** «El Gobierno del Chubut anunció obras para
Esquel» es de Esquel: el hecho ocurre acá. Tomar la escala más grande mandaría
casi todo a provincial, porque el Estado aparece en cualquier nota de gestión.

## Qué hacer

1. **Columna `escala` en las notas**, calculada en el enriquecimiento.
2. **Selector de escala en cada pestaña**, junto al de medio y ventana.
   `ambito.ESCALAS` y `ambito.ETIQUETA` arman los controles.
3. **`sin_determinar` es un grupo visible, no un descarte.** Cuando no hay
   topónimo, `confiable` viaja en falso. Mostralas aparte en vez de meterlas en
   «Esquel»: un balde silencioso de notas mal ubicadas contamina todos los
   promedios sin que nadie lo note, y su volumen es el indicador de salud del
   clasificador.
4. **En la cola editorial, filtrar por `ambito.apta_para_pieza()`.** Una nota
   nacional no da pieza: no tenemos fuentes propias ni archivo para aportar
   algo que no esté en cualquier portal grande. El motivo va a la traza.

---

# F — Pestaña nueva: Insights

La pregunta no es «qué pasó en Esquel» sino **«qué está haciendo cada
redacción»**. Cuánto publica, a qué hora, sobre qué, y qué cambió respecto de
lo que venía haciendo.

Módulo: **`app/core/insights_medios.py`**.

```python
from app.core import insights_medios as im

p = im.perfil("red43", notas, dias_ventana=30)
im.ritmo({m: perfil_de(m) for m in medios})
im.comparar("red43", notas_mes_pasado, notas_este_mes, dimension="tema")
im.divergencia(perfil_a, perfil_b)
im.exclusivos(perfiles)
im.huecos(perfiles, temas_esperados)
```

Cuatro bloques:

| Bloque | Qué muestra |
|---|---|
| Ritmo | Notas por día, hora pico, reparto mañana/tarde/noche |
| Foco | Proporción por tema, con la concentración temática |
| Desplazamientos | Qué cambió entre dos períodos, con la lectura |
| Huecos | Lo que **ningún** medio está cubriendo |

**Lo más valioso son los dos últimos.** Un desplazamiento de foco es una
noticia sobre el medio: cuando un portal que publicaba tres notas semanales de
un tema deja de publicarlas de un mes para otro, eso pasó por algo.

**La lectura es descriptiva a propósito.** El sistema puede decir que un medio
pasó de 22% a 6%; **no puede decir por qué**, y escribir «dejó de cubrir» ya
insinúa una decisión. El texto que devuelve `comparar()` dice explícitamente
que el sistema no distingue entre que el tema se agotó y que cambió la
prioridad. No lo reescribas para que suene más filoso.

**Y respeta los mínimos:** `perfil()` con menos de 40 notas devuelve
`confiable=False`, y `comparar()` con menos de 25 por período devuelve lista
vacía. 2 de 5 notas y 20 de 100 se ven igual en porcentaje y no significan lo
mismo.

Los huecos también sirven para elegir la hora de salida propia: publicar a la
misma hora que el medio de 57.000 seguidores es competir por el mismo minuto de
atención con cincuenta veces menos alcance.

---

# G — Los títulos y enlaces vacíos de FM del Lago

En el Feed Social, las publicaciones de FM del Lago muestran «Publicación sin
título de FM Del Lago» y sin enlace. **No es que se scrapeó mal**: FM del Lago
publica el texto directo en Facebook, sin nota enlazada, así que no hay título
ni URL que capturar.

Pero ahora **tenemos 1.300 notas de su portal en la base**. El título está del
otro lado.

## El diagnóstico

Tu propio log lo dice: *«12 emparejadas con Facebook»* sobre ~10.700 notas web
y 165 posteos. El emparejado por URL exacta casi nunca funciona, porque la
mayoría de los posteos no llevan enlace.

## La solución

`medios.emparejar_aproximado()` empareja por **contención de texto** dentro del
mismo medio y una ventana de 30 horas.

```python
vinculos = md.emparejar_aproximado(notas_web, posts_fb)
t = md.titulo_y_enlace(post, vinculo)
# {titulo, titulo_es_real, url_nota, origen_titulo, aproximado}
```

**La distinción que lo hace seguro — no la borres:**

- **Mostrar** (título, enlace): un vínculo aproximado alcanza. Si nos
  equivocamos, el lector abre una nota parecida del mismo medio y del mismo
  día. Molesto, recuperable.
- **Atribuir** (comentarios, saldo, RTC): **sólo** vínculo por URL.
  `md.puede_atribuir(vinculo)` lo decide. Si nos equivocamos acá, una nota
  carga con la reacción de otra y las métricas del medio quedan mal sin que
  nadie pueda notarlo.

En la interfaz, marcá los aproximados: `aproximado=True` significa «este título
viene de una nota del portal que creemos que es la misma».

**La medida es contención y no Jaccard**, y la diferencia importa: un posteo
trae hashtags, saludos y llamados a la acción que el titular no tiene, y esas
palabras de más castigan al Jaccard aunque el hecho sea idéntico. El caso real
da 0,53 de Jaccard y 0,73 de contención.

## Y el otro enlace

«Ver nota en portal» manda al home de Facebook del medio. Es el mismo
`or medio["fb_url"]` de antes, aplicado a `canonical_url`. Buscalo y sacalo:
cuando no hay URL de nota, no hay botón.

---

# H — Arreglos del Taller

Tres cosas que se ven en tus capturas, ya corregidas en `taller.py`:

1. **«Guion de Video (HILO · 23.2s)»** — un video de texto de 23 segundos, que
   no es nada. `guion_video()` ahora rechaza `hilo` y `placa` con
   `ValueError`. En la interfaz: para el hilo, mostrá `hilo_x()`, no un guion.

2. **«Tema: . Lugar: Esquel»** en el prompt de imagen. `prompt_de_imagen()`
   ahora cae a `macro_eje`, `issue` y por último al titular.

3. **Sólo se ofrecía «Hilo de X»** para una pieza con 13 despidos, 10
   comentarios y ángulo reclamo. Debería habilitar también El Dato y La Bronca.
   **La pieza que le pasás a `derivaciones_disponibles()` está incompleta:**
   necesita `angulo`, `testimonios`, `numero` y `fuerza_angulo`. Revisá el
   endpoint.

4. **El cierre del hilo decía «Seguimos el tema.»** — no es una acción
   posible. Ahora es el enlace, o la pregunta abierta con un pedido concreto.

## Y algo nuevo: `diagnostico_alcance()`

```python
d = tl.diagnostico_alcance(pieza, contexto)
# {cumple, faltan, problemas, de_siete, falta_lo_basico}
```

Siete condiciones y cuatro antipatrones, cada uno con el **por qué**. No es una
fórmula de viralidad —no existe, y quien la vende está vendiendo otra cosa—:
es la lista de lo que falta, que es lo accionable.

Mostralo en el Taller como una checklist antes de las derivaciones. `faltan`
arriba, `problemas` en rojo. Si `falta_lo_basico` es verdadero —sin lugar
concreto y sin número—, avisá fuerte: una pieza cívica local sin eso no circula
por buenos que sean los otros cinco criterios.

Los criterios están explicados en `editorial/05-viralidad.md`, incluida la
sección **«Lo que no hacemos, aunque funcione»**, que es la que más importa.

---

# I — La consola

Está reportando bien, y lo que reporta es real: **5 de 8 procesos necesitan
atención**.

```
enriquecimiento   ERROR           "Fallo transitorio en conector de red"
maduracion        NUNCA EJECUTÓ
sintesis          NUNCA EJECUTÓ
scraper_social    ATRASADO
scraper_web       ATRASADO
```

`maduracion` y `sintesis` **nunca corrieron**. Son el corazón del pipeline
editorial: sin ellos no hay maduración de 48 h ni síntesis de comentarios. Hay
que ponerlos en el scheduler.

## Y una contradicción para resolver

La tabla de ingesta dice **fmdellago: 1300 notas web**. El log de `scraper_web`
dice **`fmdellago=0`**. Los dos no pueden tener razón.

Averiguá cuál miente. Si el 1300 es de una corrida anterior y la última dio 0,
la API de WordPress de FM del Lago dejó de responder — y eso rompe justo el
emparejado de la tarea G, que es el que arregla los títulos.

---

# REPARTO CON EL SEGUNDO MODELO (3.8 high)

Mismo criterio: **si el error se ve o no se ve**.

**A 3.8 high** — donde equivocarse devuelve algo plausible que nadie detecta:

- **A** completo, y poblar `enriched_articles.issue`.
- **B punto 1**: reescribir el prompt del generador. Es la parte que decide qué
  sale publicado con nuestra firma.
- **E punto 4**: qué entra y qué no a la cola editorial por escala.
- **G**: el umbral de contención y qué vínculos habilitan atribuir métricas.
- **I**: la contradicción del 1300 contra 0.
- **Revisar la integración del otro modelo antes de mergear**, con la consigna:
  *«¿este dato se calculó sobre suficiente evidencia como para mostrarse, y
  este vínculo es sólido como para citarlo?»*.

**Al modelo principal** — donde el error se manifiesta solo:

- B puntos 2 y 3, C, D, F, H, y las pestañas de E.
- Migraciones, endpoints, interfaz.

**Tres reglas:** ninguno revisa lo suyo; las 459 pruebas corren antes de cada
commit; y si una falla, no la «arregles» cambiando lo que espera sin entender
por qué falló.

---

# INVARIANTES — no se tocan

1. **Gemini Lite gratuito.** No se cambia de proveedor. Si algo no entra en la
   cuota, se prioriza qué se procesa.
2. **Nada se publica sin revisor humano.** Piezas, derivadas y ahora también
   notas del portal. La regla vive en triggers de la base.
3. **Maduración: mínimo 6 h para descartar, máximo 48 de seguimiento.**
4. **`calcular_baseline_medio()` recibe engagement**, no reacciones.
5. **Todo texto publicable pasa por `verificar_texto()`** — que ahora incluye
   la filtración del método.
6. **Un dato ausente se guarda como `NULL`, nunca estimado.** Y —lo que
   aprendimos esta vuelta— **un dato ausente tampoco cuenta como evidencia en
   contra**: por eso se normaliza el puntaje de la correlación.
7. **Nada de evasión de detección.** Graph API, API de WordPress, pedidos
   espaciados.

---

# QUÉ DEVOLVER

1. `python -m pytest tests/ -q` completo.
2. **Confirmación de que tu v11 está pusheado a GitHub.**
3. **A:** la búsqueda de antecedentes de Fontana, ahora con citables.
4. **B:** una pieza generada cuya bajada diga qué pasó, con el método en la
   ficha del pie.
5. **C:** una nota del portal completa, con sus advertencias.
6. **D:** captura de la config, incluidas las cinco cosas no configurables.
7. **E:** el conteo por escala (`SELECT escala, COUNT(*) … GROUP BY 1`),
   incluyendo `sin_determinar`.
8. **F:** la pestaña de Insights con un desplazamiento de foco real.
9. **G:** una publicación de FM del Lago que antes decía «sin título» y ahora
   muestra el título de la nota del portal, marcada como aproximada.
10. **I:** los cinco procesos en verde, y la explicación del 1300 contra 0.
