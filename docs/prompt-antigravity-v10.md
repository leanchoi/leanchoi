# Prompt para Antigravity — Guillotina v10: taller, archivo y multi-sitio

> Copiá desde acá hasta el final.

---

Traé la rama primero:

```bash
git fetch origin claude/taxonomia-v4 && git rebase origin/claude/taxonomia-v4
python -m pytest tests/ -q --ignore=tests/test_facebook_worker.py   # 378
```

Hay tres módulos nuevos en `app/core/` listos para conectar y un defecto que
corregir. Nada de esto pide inventar lógica: está escrito y probado.

---

## A — El enlace de Facebook no abría *(corregido, falta conectar)*

El usuario probó el enlace que generábamos:

```
https://www.facebook.com/fb/posts/canal4esquel_461f1797b412   ← no abre
https://www.facebook.com/share/p/1EhKf2MCus/                  ← así son los reales
```

**La causa:** `facebook_worker.py:362` genera el `post_id` como
`fb_{medio}_{md5}` cuando el DOM no expone el id real. De un identificador que
inventamos nosotros no hay ningún permalink derivable, y `permalink_facebook()`
lo construía igual. Es el mismo error que las reacciones fabricadas: producir
algo con forma correcta y contenido falso.

`app/core/ficha_nota.py` ya está corregido — usa el permalink real, sólo
construye cuando los dos componentes son ids de Facebook de verdad, y si no
devuelve `None` con el motivo.

**Lo que falta:**

1. **Guardar `permalink` en `social_posts`.** El scraper ya lo captura
   (`facebook_worker.py:245`) pero se pierde. Agregá la columna y persistilo.
2. **Arreglar el fallback de la línea 359.** Hoy dice:
   ```python
   permalink = p.get("permalink") or medio["fb_url"]
   ```
   Ese `or` es lo que manda al usuario al muro del portal. Tiene que ser
   `p.get("permalink") or None` — y que la ficha diga que no hay enlace, que ya
   sabe hacerlo.
3. **Pasarlo a `enlaces()`**: `post.get("permalink")` es el cuarto argumento.
4. **En la interfaz**, cuando no hay enlace mostrar el motivo, no un botón que
   no lleva a ningún lado.

Si además podés capturar el `post_id` numérico real del DOM, mejor todavía —
pero el permalink guardado resuelve el problema sin eso.

## B — El taller: dónde viven las notas aprobadas

`app/core/taller.py`. Hoy una pieza aprobada no va a ningún lado.

**Estados.** El ciclo pasa a ser
`borrador → en_revision → aprobada → en_taller → derivada_lista → publicada`.
`transicion_valida()` las valida y explica cuál sí se puede.

`en_taller` está separado de `aprobada` a propósito: aprobar una nota y aprobar
un reel son dos decisiones distintas, y el video lo ve diez veces más gente que
el texto. No las unifiques en un solo botón.

**Pestaña nueva: Taller.** Lista de piezas aprobadas. Al abrir una:

- La pieza entera, como quedó aprobada.
- `derivaciones_disponibles(pieza, issue_reaparece)` → qué formatos tienen
  sentido **para esta pieza**, cada uno con el motivo. No ofrezcas los cinco
  siempre: una pieza sin conflicto no habilita La Bronca, y forzarla produce
  indignación fabricada sobre un hecho que no la tiene.
- `guion_video(pieza, voz, formato, contexto)` → escenas con locución, texto en
  pantalla, indicación visual y segundos.
- `hilo_x(pieza, contexto, enlace)` → los tuits numerados con gancho.
- `prompt_de_imagen(pieza)` → para pegar en el generador de imágenes.

**Botón de copiar en cada bloque.** El guion se pega en otra herramienta; que
haya que seleccionarlo a mano arruina el flujo entero.

**Las advertencias se muestran, no se esconden.** `guion_video` avisa cuando el
guion no entra en el formato, cuando el texto en pantalla no va a leerse en
vertical, o cuando una escena viola los límites editoriales. **No lo recorta
solo**: recortar cambia lo que dice, y lo que dice es lo que una persona
aprobó. Mostrá los avisos y que decida la persona.

**Tabla nueva:**

```sql
CREATE TABLE IF NOT EXISTS derivada (
    id INTEGER PRIMARY KEY,
    pieza_id TEXT NOT NULL REFERENCES pieza(id),
    voz TEXT, formato TEXT, plataforma TEXT,
    guion_json TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'borrador',
    revisor TEXT, revisada_at TEXT, publicada_at TEXT,
    creada_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_derivada_pieza ON derivada(pieza_id);
```

Con el mismo trigger que `pieza`: ninguna derivada pasa a `publicada` sin
revisor.

## C — La memoria del archivo

`app/core/contexto_historico.py`. Es lo que convierte una gacetilla en
periodismo: no "la municipalidad niveló Fontana", sino "la nivelaron por cuarta
vez en dos años".

**Lo que hace falta primero: búsqueda de texto completo.** El módulo recibe una
lista de notas candidatas y decide cuáles merecen citarse — la búsqueda ancha
sobre 109k notas es tuya:

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS archivo_fts USING fts5(
    note_id UNINDEXED, titulo, cuerpo,
    tokenize = 'unicode61 remove_diacritics 2'
);
```

Poblala desde `enriched_articles` en un job nocturno. La consulta sale de
`expandir(titulo, texto, issue, actores)`: usá `consulta.lugares` y las palabras
de `consulta.terminos` como términos FTS, traé 200 candidatas, y pasáselas a
`buscar()`.

**Dónde engancha:**

1. En `job_maduracion_editorial`, antes de generar la pieza: el `frase_contexto`
   entra en el texto.
2. En la ficha del popup, como bloque "Antecedentes".
3. En el taller, como escena del guion.

**Lo que no podés relajar.** El módulo es tímido a propósito, porque vincular
dos hechos que no lo están publica algo falso con aire de dato duro:

- **El issue no es un ancla.** Sólo un lugar o un actor compartido autoriza un
  antecedente `directo`. Sin esa regla, "es la cuarta vez que repasan Fontana"
  puede terminar citando una obra en Melipal.
- **`citables` y `sugerencias` van separadas.** Sólo `citables` entra en texto
  automático. `sugerencias` se le muestra a quien revisa, con el motivo del
  vínculo. No las mezcles en una sola lista.
- **Los umbrales no están calibrados todavía** — salieron de razonar sobre los
  pesos, no de medir. Hasta que se validen, que las citas automáticas pasen por
  revisión.

## D — Scrapear los sitios web de los otros tres medios

Hoy `discovery.py` tiene el dominio **hardcodeado en una regex de módulo**:

```python
SITEMAP_RE = re.compile(r"https?://www\.red43\.com\.ar/sitemaps_index/sitemap\d+\.xml")
```

Así que se scrapea el sitio de Red 43 y las **páginas de Facebook** de los
cuatro medios, pero ningún otro sitio web. Falta `eqsnotas.com` y los
equivalentes de Canal 4 y FM del Lago.

Vale la pena por tres razones, en orden:

1. **El texto completo.** Un posteo de Facebook trae el copete; la nota trae el
   cuerpo y las fuentes. La correlación histórica necesita texto largo — con
   títulos solos el solapamiento de vocabulario es demasiado pobre para
   distinguir el mismo hecho de la misma categoría.
2. **La URL canónica**, que es la que debería mostrarse en la ficha.
3. **Comparar entre medios:** quién cubrió qué y quién no.

**Cómo hacerlo:**

- Convertí `SITEMAP_RE` en algo derivado del dominio configurado, y `config.py`
  en una lista de medios en vez de constantes `RED43_*`. Es la refactorización
  central de esta tarea; el resto es un extractor por sitio.
- **Seis meses alcanza.** El histórico completo sólo lo necesitamos de Red 43,
  que ya lo tenemos.
- `robots.txt`, `User-Agent` identificado, y espaciado entre pedidos. Son medios
  locales con infraestructura chica: saturarlos es un problema técnico y también
  de vecindad.
- Guardá la fuente en cada nota (`origen='web'|'facebook'`) y vinculá la nota
  web con el posteo de Facebook cuando la URL coincida. Ese vínculo es lo que
  permite decir "esta nota tuvo 400 comentarios" con el texto completo al lado.

---

## Reparto con el segundo modelo (3.8 high)

- **3.8 high:** C completo. La consulta FTS y los umbrales deciden qué se cita
  como antecedente, y una correlación equivocada produce una afirmación falsa
  que nadie puede verificar. También el punto 2 de A: decidir qué se guarda
  cuando no hay permalink.
- **Modelo principal:** A (resto), B completo, D. Plomería, interfaz y
  refactorización con pruebas que ya existen.
- Ninguno revisa lo suyo. Las 378 pruebas corren antes de cada commit.

## Lo que dejo anotado y no está hecho

| Pendiente | Estado |
|---|---|
| TTS + ffmpeg para armar el video | el guion ya sale; falta el ensamblado |
| Publicación automática en plataformas | deliberadamente al final |
| Sexta voz (registro cómico) | después de varios meses de tono establecido |
| Calibrar `UMBRAL_DIRECTO` / `UMBRAL_PROBABLE` | 30 notas a mano y comparar |
| `SECRET_KEY` fuera del código | **confirmame que está hecho** |
| `exactitud léxica 18.96%` del archivo histórico | sin explicar |

Sobre el último: la medición honesta de la taxonomía dio 74,2%. Un 18,96% o
compara contra el campo equivocado, o el léxico no cubre el vocabulario viejo.
Importa porque esos baselines calibran los umbrales de crisis, y si están
construidos sobre clasificaciones erróneas los umbrales también lo van a estar.

## Qué devolver

- `python -m pytest tests/ -q`
- Un enlace de Facebook generado por el sistema, abierto en el navegador.
- Una nota que no tenga permalink, mostrando el motivo en vez de un botón muerto.
- Un guion completo del taller, con sus advertencias visibles.
- La búsqueda de antecedentes sobre "repaso de calle Fontana", mostrando
  `citables` y `sugerencias` por separado con el motivo de cada vínculo.
