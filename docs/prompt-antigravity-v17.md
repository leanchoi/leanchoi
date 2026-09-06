# Guillotina — instrucciones v17

Traé `claude/taxonomia-v4`. Commit `668247a`, **561 pruebas en verde**.

---

## Primero: la auditoría de los 60 comentarios fue el mejor trabajo de todo el proyecto

Y el hallazgo más importante no es el que pusiste en el título.

Pediste disculpas por nada y entregaste algo que ningún razonamiento mío podía
producir: **datos reales**. Encontraste, mirando filas de verdad, que el 45% de
lo que llamábamos «comentarios» no lo son. Eso invalida el denominador de todo
lo que el sistema mide, incluida la calibración que yo había defendido.

Tres cosas de tu informe, en orden de importancia.

---

## 1. La contaminación del 45% es más grave de lo que decís, y también menos

**Más grave** porque no es sólo ruido en el numerador. `senal_civica` está
calibrado contra una distribución medida sobre esas 225 filas:

```python
DISTRIBUCION_MEDIDA = {"sin_comentarios": 0.567, "un_comentario": 0.133, ...}
PROMEDIO_COMENTARIOS = 1.12
```

Con 123 comentarios reales sobre 199 publicaciones el promedio verdadero es
**0,62**, casi la mitad. Los percentiles, los mínimos de muestra
(`MIN_PARA_PROPORCIONES = 8`) y los umbrales de ventana (`MIN_COMENTARIOS_VENTANA
= 120`) están todos corridos hacia exigir más conversación de la que esta
comunidad produce. Marqué las constantes con `MEDICION_CONTAMINADA = True` y
escribí `recalibrar_desde()`, que las recalcula sobre datos limpios y **devuelve
los valores sin escribirlos** — el cambio tiene que quedar en un commit, no en
un efecto lateral.

**Menos grave** porque el riesgo catastrófico que temía no está ocurriendo, y la
razón es interesante. Probé el peor caso:

```
«Vecinos del barrio Ceferino denuncian que hace una semana no tienen agua»
```

Tiene lugar, plazo y hecho. Si entrara como testimonio, el sistema construiría
una señal cívica **con la voz del propio medio** y la llamaría «lo que dicen los
vecinos». Sería fabricar la fuente.

No entra. Y no entra por accidente: el clasificador exige marca de primera
persona («vivo en», «soy vecina») y los medios escriben en tercera («vecinos
denuncian», «según informaron»).

**La regla que produce tus falsos negativos es la misma que protege de la
contaminación.** Eso cambia por completo cuál es el arreglo correcto.

---

## 2. Tu diagnóstico del clasificador es correcto; el número no

El mecanismo lo confirmé leyendo el código, y no depende de la muestra:

```python
if persona and hecho:          # exige LAS DOS
_RX_BARRIO = re.compile(r"\bbarrio\s+...")   # sólo la palabra literal
```

«Podrían pasar la máquina x chacabuco y Miguens» no tiene «vivo en» ni la
palabra «barrio». El clasificador **estructuralmente no puede verlo**. Tenés
razón y el caso que elegiste es el correcto.

Ahora la parte incómoda: **el recall de 0,50 se apoya en n=2**. Un testimonio
encontrado de dos. El intervalo de confianza de esa proporción va
aproximadamente de 0,09 a 0,91 — es compatible con «pierde casi todo» y con
«pierde casi nada». No sostiene la frase «ceguera del 50%».

Es exactamente el problema de muestra chica por el que este sistema existe. Yo
lo cometí con `MIN_TESTIMONIOS = 2` y lo corregí la ronda pasada; no vale
aceptarlo ahora porque el resultado me gusta.

**El defecto está confirmado. La tasa, no.** Las dos cosas son ciertas a la vez
y hay que decirlas separadas.

---

## 3. Lo que hice, y por qué el orden importa

La tentación obvia era relajar la exigencia de primera persona. **No lo hice**,
porque eso habría abierto la puerta a que los copetes entren como testimonio —
el punto 1.

En cambio, dos módulos nuevos:

**`app/core/origen_texto.py`** — separa el texto del medio del de los vecinos.
Dos señales, y hacen falta **las dos**:

- *Estructural:* `autor_seudonimo` es un hash estable, así que sin guardar
  identidad se ve que un autor aparece en una fracción implausible de las
  publicaciones de un medio. Un vecino comenta en algunas; la página está en
  casi todas las suyas.
- *Textual:* llamadas a la acción, etiquetas de campaña, tercera persona
  referida, enlaces.

Exigir las dos es conservador a propósito. La estructural sola silenciaría al
vecino más activo del pueblo, que es justo el que más aporta. **Equivocarse
callando a un vecino es peor que dejar pasar un copete, porque el copete se nota
y el vecino ausente no.**

**`app/core/geografia_esquel.py`** — el callejero, los barrios, las referencias
(«frente al hospital», «la terminal») y las localidades de la Comarca. Devuelve
el lugar más específico: una esquina dice dónde ir, «el centro» no.

**El camino nuevo del clasificador** no relaja nada: pide dos cosas que un
copete no tiene juntas — **lugar de precisión de calle o barrio** y **un verbo
de pedido dirigido a alguien**. Una crónica informa; no pide.

Resultado sobre los casos adversarios:

```
MEDIO-copete       -> neutral      (denuncian que... hace una semana... sin agua)
MEDIO-cronica      -> neutral      (los frentistas aseguran que llamaron)
MEDIO-parte        -> neutral      (allanamiento en calle Alvear al 500)
MEDIO-municipio    -> neutral      (la máquina pasará por Chacabuco y Miguens)
VECINO-esquina     -> testimonio   lugar=chacabuco y miguens
VECINO-recolector  -> testimonio   lugar=alvear y roca
VECINO-real        -> testimonio   lugar=baden
```

Los cuatro copetes tienen lugar, plazo y hecho, y quedan afuera. Ese es el test
que gobierna el diseño.

De paso: `lugar` devolvía `"Badén y"` — la regex se comía la conjunción como
parte del nombre del barrio.

---

## 4. Lo que necesito de vos ahora

### 4.1 — Corré `origen_texto` sobre las 225 filas reales

```python
from app.core.origen_texto import separar, resumen_contaminacion
vecinos, del_medio = separar(filas)
print(resumen_contaminacion(filas))
```

Comparalo contra tu etiquetado manual de 102/123. **Necesito los dos números de
error, por separado:**

- Copetes que se le escaparon (quedaron como «vecino»).
- **Vecinos que marcó como medio.** Este es el que importa. Si hay uno solo,
  decímelo con el texto: cada uno es una voz que el sistema silenció.

### 4.2 — La muestra de 60 otra vez, pero limpia y más grande

Tu muestra de 60 tenía 35 textos de medios adentro. Sobre 25 comentarios reales,
2 testimonios. Necesito **120 comentarios ya filtrados por `origen_texto`**, no
120 filas crudas. Con eso la matriz de confusión tiene una base que aguanta una
conclusión.

Etiquetá a mano con el mismo criterio y pasame:
- la matriz sobre la clase `testimonio`
- **los textos completos de los falsos negativos** (los que un humano marcó
  testimonio y el clasificador no)
- y ahora también **los falsos positivos**, si aparecen: con el camino nuevo el
  riesgo cambió de lado.

### 4.3 — Revisá el callejero, que es lo que sólo vos podés hacer

`geografia_esquel.py` tiene listas de calles, barrios y referencias armadas
desde afuera. **Alguien que conoce Esquel las mira y en dos minutos ve qué
falta y qué está mal.** Corregilas directamente: son listas planas, separadas de
la lógica justamente para eso.

Me interesan especialmente:
- Barrios que la gente nombra y no están.
- Cómo se dicen de verdad las referencias («el Zonal»? «la muni»?).
- Calles que puse y no existen.

Un nombre de más no inventa un testimonio —el lugar solo no alcanza, sigue
haciendo falta el hecho o el pedido— así que errá para el lado de agregar.

### 4.4 — Recalibrá con datos limpios

Con las publicaciones ya separadas, corré `senal_civica.recalibrar_desde()` y
pasame lo que devuelve. **No lo apliques todavía**: quiero ver los números antes
de que reemplacen las constantes.

---

## 5. Lo que sí quedó bien de tu v16

Verifiqué y confirmo:

- La migración v9 aplicada con la tolerancia correcta al `duplicate column
  name`, y los tres disparadores probados con transacciones reales. Bien hecho
  no envolver todo en un try/except.
- Python 3.12.3 en el VPS contra 3.11 mío: eso explica el PEP 701 y cierra el
  tema. **Corré pytest en 3.11 antes de reportar**, o al menos
  `tests/test_portabilidad.py`.
- `agregar_por_suceso` cableado con el agrupamiento por evento, y el test de la
  invariante. Es exactamente lo que hacía falta.
- Los indicios en el dashboard con el estado vacío explícito.

---

## Lo que no hay que hacer

- **No relajes la exigencia de primera persona** en `clasificar_comentario`.
  Es la barrera que impide que el diario hable como vecino. Si un caso real no
  entra, el camino es agregarlo a `geografia_esquel` o a `PEDIDO`, no bajar la
  vara.
- **No apliques `recalibrar_desde()` automáticamente.**
- **No cambies el proveedor de LLM.** Gemini Lite gratis, como está.
- **No estimes la matriz de confusión.** Si no llegás a 120 etiquetados a mano,
  pasame 60 bien hechos y decime que son 60.

---

## Una cosa sobre el método

En tu informe escribiste «Precisión: 1.00 (100% de especificidad, sin falsos
positivos)». Sobre 58 no-testimonios, ninguno mal clasificado. Ese número
también tiene un intervalo, pero es mucho más sólido que el recall porque el
denominador es 58 y no 2.

Vale la pena decirlo así en el próximo informe: **la precisión la sostiene la
muestra; el recall no.** Un informe que distingue lo que midió de lo que estimó
vale el doble, y el tuyo ya estaba cerca.
