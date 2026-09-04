# PROMPT PARA ANTIGRAVITY — Guillotina v7: pipeline editorial

---

## ANTES QUE NADA: LA PLATAFORMA SE LLAMA GUILLOTINA

Cambió el nombre. Donde diga **Media Abrojal**, ahora es **Guillotina**.

Alcance del cambio:

- Marca visible: título, isotipo, pie de página, fichas de origen, placas
- `editorial/*.md` y `editorial/voces/*.md` — la firma en cada archivo
- `README.md`

**No renombres todavía** rutas, archivos de base ni servicios
(`/opt/red43_allsite`, `red43_allsite_enriched_v1.sqlite`). Ese cambio es
riesgoso, no aporta nada funcional y puede dejar el sistema sin arrancar. Va al
final de todo, con la base respaldada y el servicio detenido.

Red 43 y los otros tres medios siguen acreditados como **fuente** en cada
pieza. Lo que cambia es la marca del producto, no la atribución.

---

## CONTEXTO

Rama con el trabajo hecho, testeado y documentado:

```bash
cd /opt/red43_allsite
git fetch origin
git checkout claude/taxonomia-v4
python3 -m pytest tests/ -v     # 260 tests
```

**260 tests pasan.** No reescribas estos módulos: integralos.

### Restricciones que no se tocan

1. **Plan gratuito de Gemini Lite.** No cambies de proveedor. Todo está
   diseñado para esa cuota.
2. **Nada se publica sin que una persona lo apruebe.** Hay un trigger en la
   base que lo sostiene. No lo saques.
3. **No scrapees Facebook eludiendo detección.** La vía es la Graph API con
   token de página. Ver `docs/arquitectura/03-capa-social.md` §3.

---

## LO QUE HAY EN LA RAMA

### Motor analítico

| Archivo | Qué hace |
|---|---|
| `app/core/metrics.py` | Resonancia, saldo, controversia, pulso |
| `app/core/taxonomy.py` | Clasificador multi-etiqueta |
| `app/core/issues_esquel.py` | 17 conflictos locales + macro-ejes |
| `app/core/actores.py` | Detección y favorabilidad de actores |
| `app/core/cooccurrence.py` | Co-ocurrencia (PMI) y desfasaje temporal |
| `app/core/social_semantica.py` | Las 6 reacciones de Facebook con su semántica |
| `app/core/polisemia.py` | P(burla) del Haha con 5 señales |
| `app/core/tension_civica.py` | RTC con encogimiento, velocidad y alerta |
| `app/core/comentarios.py` | Triaje local: rechazo/apoyo/testimonio |

### Pipeline editorial (lo nuevo)

| Archivo | Qué hace |
|---|---|
| `app/core/maduracion.py` | Proyecta el engagement final y decide cuándo decidir |
| `app/core/seleccion_editorial.py` | Umbral por medio, detección de ángulo, cola del día |
| `app/core/gacetilla.py` | Genera el borrador y verifica los límites en código |
| `app/core/voces.py` | Derivadas sociales: placas, carruseles, reels |
| `app/core/clasificador_llm.py` | Escalón de modelo con control de cuota |
| `app/core/sintesis_gemini.py` | Síntesis de hilos, 1 llamada por hilo |

### Editorial (el espíritu del sistema)

```
editorial/00-corazon.md       para qué existe, tono
editorial/01-pulso.md         cómo se usa la conversación
editorial/02-estructura.md    las 6 partes de una pieza
editorial/03-limites.md       lo que nunca
editorial/04-formatos.md      plantilla por ángulo
editorial/voces/*.md          las 5 voces
```

**Estos archivos se cargan y se inyectan en el prompt.** Cambiar la voz del
producto es editar un markdown, no tocar código.

### Esquema

`sql/migracion_v7_editorial.sql` — aditiva sobre v6. Verificado: v4+v5+v6+v7
aplican limpio, 22 tablas, 2 vistas.

### Documentación

- `docs/arquitectura/05-pipeline-editorial.md` — el pipeline completo
- `docs/arquitectura/06-que-es-esto.md` — qué es el producto, comparables,
  buenas prácticas de 2026, el flujo multi-voz

---

## LA CORRIDA DE PRUEBA — CORRELA PRIMERO

```bash
python3 scripts/simular_dia.py
```

40 publicaciones, 4 medios, 24 h simuladas. No toca la base ni la red.

Encontró tres defectos que ya están corregidos, y que te van a pasar de nuevo
si no los tenés presentes:

**1. El umbral estaba en unidades equivocadas.** `calcular_baseline_medio`
tiene que recibir **engagement** (`reacciones + 3 × comentarios`), no
reacciones sueltas. Con reacciones el umbral queda 1,58× más bajo: el "p75"
funciona como un p60 y el sistema selecciona el 78% de los posts. **No falla a
la vista.** Simplemente publica de más.

**2. Cuatro medios cubren la misma inauguración.** No se descartan duplicados:
se **fusionan** con `agrupar_por_evento()`. Cobertura simultánea es una señal
más fuerte, no cuatro noticias.

**3. El léxico de testimonios perdía el reclamo más común.** "no me atienden"
no matcheaba porque el léxico tenía "no atienden" y el pronombre rompe la
adyacencia. Si agregás términos, acordate de las variantes con pronombre.

---

## FASE 1 — MIGRACIÓN

```bash
cp masters/red43_allsite_enriched_v1.sqlite masters/red43_allsite_enriched_v1.sqlite.bak
sqlite3 masters/red43_allsite_enriched_v1.sqlite < sql/migracion_v7_editorial.sql
```

Agrega: `maduracion`, `baseline_medio`, `cola_editorial`, `piezas`,
`eventos_sistema`, `estado_procesos`, `medios_config`, la vista
`v_explorador`, y `medio_id` en `social_posts`.

**Aceptación:** las cuatro migraciones aplican sin error y
`SELECT COUNT(*) FROM v_explorador` responde.

---

## FASE 2 — AGENDA DE REVISIONES

Esto es lo que hoy no existe y es lo que hace posible todo lo demás.

Hoy el worker mide una vez y descarta. Tiene que **volver a mirar** cada post
13 veces en 48 horas:

```
0.5h · 1h · 2h · 3h · 4.5h · 6h · 9h · 12h · 18h · 24h · 30h · 36h · 48h
```

Usá `maduracion.agenda_revisiones()`. Cada visita:

1. Guarda la medición en `social_reactions` (serie temporal, ya existe)
2. Llama a `maduracion.decidir()` con el umbral del medio
3. Escribe el estado en `maduracion`
4. Si el estado es `esperar`, agenda la próxima revisión

Con 60 posts diarios son ~780 lecturas en 48 h: entra en un barrido cada 30
minutos.

**Aceptación:** un post con 22 de engagement a las 2 h queda en `esperar`, no
en `descartar`. Si lo descarta temprano, el sistema pierde las notas que
explotan al día siguiente — que es el problema que esto viene a resolver.

---

## FASE 3 — LÍNEAS DE BASE

Job nocturno que puebla `baseline_medio` con los últimos 14 días.

⚠️ **Sobre engagement, no sobre reacciones.** Ver defecto 1 de la corrida.

```python
from app.core.maduracion import Medicion
from app.core.seleccion_editorial import calcular_baseline_medio

hist = [Medicion(m, r, c).engagement for m, r, c in mediciones_del_medio]
base = calcular_baseline_medio(hist, medio_id)
```

También: `polisemia.calcular_baselines()` (proporción de Haha por medio y eje) y
`tension_civica.calcular_bases()` (RTC por segmento). Ambos semanales.

**Aceptación:** las 4 filas de `baseline_medio` tienen `muestra >= 20`, y el
umbral de canal4esquel es visiblemente mayor que el de red43.

---

## FASE 4 — COLA EDITORIAL

Job diario que:

1. Toma las que quedaron en `seleccionar`
2. Lee comentarios → `comentarios.analizar_hilo()`
3. Sintetiza → `sintesis_gemini.sintetizar_hilo()` (1 llamada por hilo)
4. Evalúa → `seleccion_editorial.evaluar_candidata()`
5. Arma la cola → `armar_cola(cupo=4)`
6. Asigna franjas → `asignar_franjas()` → 09:00, 11:30, 18:30 ×2

**Aceptación:** la cola nunca trae dos piezas del mismo hecho, ni más de 2 del
mismo medio, ni más de 2 del mismo ángulo.

---

## FASE 5 — GENERACIÓN

`gacetilla.generar()` con el clasificador de Gemini ya configurado.

El flujo de estados es `borrador → en_revision → aprobada → publicada`, y
`rechazada` cuando la verificación encuentra una violación.

**Una pieza rechazada NO desaparece**: queda visible con el motivo, para que se
vea en el tablero.

⚠️ **Modo sombra dos semanas.** Que genere sin publicar nada. Es la forma
barata de ver la calidad real antes de que salga algo con la marca.

**Aceptación:** `verificar()` rechaza una pieza que nombra a un comentarista,
que dice "escandaloso", que afirma "mintió", o que dice "muchos vecinos" sin
denominador. Hay tests que lo cubren.

---

## FASE 6 — DERIVADAS SOCIALES

`voces.voces_aplicables()` decide qué voces habilita cada pieza;
`voces.derivar()` arma cada una.

**Empezá por El Dato y La Bronca**: son placas y carruseles. Cero video, cero
locución, cero etiquetado de IA. Si esas dos funcionan, el resto es producción.

El Contraste (reel) cuando haya biblioteca de clips.

⚠️ **Etiquetado obligatorio.** Toda locución sintética se declara en la pieza y
en el campo que pide la plataforma. Es requisito de plataforma para contenido
político y es lo que sostiene la credibilidad del resto.

⚠️ **Nunca voz ni cara sintética de una persona real.** Recortar un clip real y
ponerle tu encuadre es comentario político y es legítimo. Fabricar que alguien
dijo algo que no dijo es falsificación, aunque la crítica de fondo sea justa.

**Aceptación:** `verificar_derivada()` rechaza una placa que nombra a un vecino
y acepta una que nombra a un funcionario por su cargo.

---

## FASE 7 — EXPLORADOR

Pestaña de ordenamiento y filtros. La vista `v_explorador` ya junta todo.

```
GET /api/v7/explorador
    ?orden=reacciones|comentarios|engagement|fecha_desc|fecha_asc|saldo_desc|saldo_asc|desgaste
    &preset=hoy|ayer|7d|30d|anio|todo
    &desde=YYYY-MM-DD&hasta=YYYY-MM-DD
    &medio=&tema=&macro_eje=&issue=&clima=&genero=
    &pagina=1&por_pagina=50
```

Todos combinables. `desde`/`hasta` pisan a `preset`.

⚠️ **Cuando se ordena por saldo, la fila muestra sobre cuántas reacciones se
calculó.** Un saldo de +0,9 sobre 8 reacciones y otro sobre 800 no son lo
mismo, y ordenados juntos el primero queda arriba sin significar nada.

---

## FASE 8 — CONSOLA

Pestaña tipo terminal con la actividad del sistema. Tablas `eventos_sistema` y
`estado_procesos`.

Cada proceso escribe una línea por acción: qué medio barrió, cuántos posts,
qué proyección hizo, cuándo llamó al modelo, cuánta cuota gastó.

```
07:40:12  scraper_social  info   barrido_medio    canal4esquel  18 posts · 2.1s
07:42:04  maduracion      info   decision         p0198         seleccionar · 6.0h
08:15:00  sintesis        info   llamada_modelo   p0198         1 llamada · 1.8k tokens
08:15:04  gacetilla       info   pieza_generada   p0198         contraste · en_revision
09:00:00  scraper_social  error  barrido_medio    fmdellago     timeout · reintento 1/3
```

Arriba, semáforo por proceso desde `estado_procesos`. Es lo que faltaba cuando
el enriquecimiento estuvo roto semanas mientras el proceso figuraba "activo".

---

## FASE 9 — SCRAPING DIRIGIDO DE ARTÍCULOS

De los otros tres medios sólo tenés post de Facebook. Sin texto de artículo no
hay clasificación temática, ni actores, ni co-ocurrencia.

**No hagas backfill de sus archivos.** Semanas de trabajo para nada: las
líneas de base son móviles (14-90 días).

Hacé esto: cuando un post linkea una nota, **traer esa nota**.

```
post con url_compartida → descargar el artículo → clasificar → guardar
```

~60 artículos por día contra ~100.000 de un backfill.

⚠️ **El matching por título está mal.** Hoy `facebook_worker.py` usa
`WHERE titulo LIKE '%...%'` sin umbral: atribuye la reacción de una nota a otra
en silencio. Usá `social_posts.url_compartida`. El título queda como último
recurso, con umbral alto, y `metodo_match` + `confianza_match` guardan cómo se
resolvió cada uno.

---

## QUÉ NO HACER

- ❌ Alimentar `calcular_baseline_medio` con reacciones en vez de engagement
- ❌ Descartar un post antes de las 6 h de observación
- ❌ Publicar sin revisor (hay un trigger que lo impide; no lo saques)
- ❌ Mostrar un saldo sin su denominador
- ❌ Matchear post↔nota por título sin umbral alto
- ❌ Voz o cara sintética de una persona real
- ❌ Nombrar comentaristas, en piezas o en placas
- ❌ Reescribir los módulos de `app/core/` que ya tienen tests
- ❌ Publicar sin dos semanas de modo sombra

---

## VERIFICACIÓN

```bash
python3 -m pytest tests/ -v      # 260 tests
python3 scripts/simular_dia.py   # corrida de un día
```

Los tests están escritos contra problemas reales, no contra la
implementación. Si alguien cambia una fórmula y una nota con 1 👍 vuelve a
rankear por encima de una con 450, el test falla.

---

## QUÉ REPORTAR

Por cada fase: qué hiciste, **la salida real del comando de verificación
pegada tal cual**, qué criterios de aceptación se cumplieron y cuáles no, y
qué quedó pendiente.

Un reporte que dice "listo" sin la evidencia no sirve.
