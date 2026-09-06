# Guillotina — instrucciones v18

Traé `claude/taxonomia-v4`. Commit `96bd6fb`, **580 pruebas en verde, 1 salteada**.

---

## Antes que nada: tu diagnóstico del scraping resolvió un misterio

Encontraste que Facebook declara **18 comentarios** en la nota de la
Cooperativa y la base guarda **3**. Lo presentaste como el punto 1 de un
diagnóstico técnico. Es más que eso: **explica una anomalía que quedé sin poder
explicar la ronda pasada.**

Yo había escrito, sin encontrarle respuesta:

> «Aun con p=0,10 la simulación da ~10 patrones y la corrida dio 2. Una brecha
> de 5× que el umbral no explica.»

Es el truncamiento. Un hilo cortado a tres comentarios **no puede** mostrar dos
testimonios aunque los tenga. La probabilidad de ver dos entre tres muestreados
es una fracción de verla entre dieciocho. No era el umbral ni el clasificador:
era que nunca vimos el hilo.

Y el sesgo va en la peor dirección posible: **el muro esconde más cuanto más se
habló.** El sistema es más sordo justo en las publicaciones que importan.

Esto cambia el orden de prioridades por completo.

### Consecuencia: no recalibres nada todavía

En la v17 te pedí que corrieras `senal_civica.recalibrar_desde()` con datos
limpios. **Cancelá eso.** La función ahora se niega sola:

```
datos truncados: se guardó el 24% de los comentarios que Facebook declara
(6 de 25), y 2 de 2 publicaciones con más conversación están incompletas.
Calibrar con esto ajustaría las constantes a la profundidad del scraper,
no a la comarca.
```

`truncamiento(publicaciones)` lo mide, con `comentarios_declarados` y
`comentarios_guardados`. Pasame ese número sobre las 199 publicaciones reales —
es el diagnóstico que quiero antes que cualquier otro.

**El scraping profundo por permalink pasa a ser la prioridad uno.** No es el
item 4 de una hoja de ruta: es la precondición para que cualquier medición
signifique algo. Todo lo que calibramos hasta ahora —la distribución, los
percentiles, `MIN_PARA_PROPORCIONES`— está ajustado a un artefacto de nuestro
propio scraper.

---

## Tu punto 2C es correcto en la medición y equivocado en el arreglo

Confirmé tu resultado corriendo los 9 comentarios: **8 en `neutral`, 0,0**.
Tenés toda la razón en que el sistema estaba ciego.

Tu arreglo propuesto es agregar «parásitos», «brillan por su ausencia», «que
paguen» al léxico de rechazo. **Eso destruiría lo más valioso del hilo.**

Mirá qué pasa con el comentario de Saturio si lo tratamos como insulto:

```
«...NO TENDRÍA QUE SER OCUPADOS POR POLÍTICOS QUE RESPONDEN A LOS GOBIERNOS
 DE TURNO, POR NO HACER LAS AUDITORÍAS ANUALES DE PRESUPUESTO»
                                 ▲
                     esto es una afirmación verificable
```

Un cronista puede ir a preguntar si la Cooperativa 16 de Octubre hizo sus
auditorías anuales. **La respuesta es una nota.** Es la mejor pista de todo el
hilo.

Clasificarlo como «rechazo 0,8» sería medir la temperatura y tirar el
contenido — exactamente el error que este proyecto existe para no cometer.

### El problema no era el léxico: era la taxonomía

Las cuatro clases —rechazo, apoyo, testimonio, neutral— miden **reacción**: a
favor, en contra, lo que me pasó, nada. No hay lugar para el ciudadano que no
reacciona sino que **argumenta cómo debería estar organizada la institución**.

Y eso es exactamente lo que hace este hilo. No es gente quejándose: es una
comunidad discutiendo quién controla a quien le fija la tarifa de la luz.

`app/core/deliberacion.py` agrega esa clase y extrae **qué se afirma**:

| tipo | qué es | verificable |
|---|---|---|
| **incumplimiento** | se nombra una obligación concreta incumplida | **sí** |
| propuesta | cómo debería funcionar | no, se contrasta con el estatuto |
| captura | la institución fue tomada por intereses ajenos | no |
| autocrítica | quien habla se incluye entre los responsables | no |

Resultado sobre tus 9 comentarios:

```
reclamo_patrimonial  deliberacion   propuesta / directorio
elogio               neutral        -
campaña              neutral        -
imputacion_personal  neutral        -
propuesta            deliberacion   propuesta / consejo de administracion
incumplimiento_rol   deliberacion   incumplimiento (sin obligación precisa)
captura              deliberacion   captura
auditorias           deliberacion   incumplimiento / auditorias  ← VERIFICABLE
autocritica          deliberacion   autocritica

PISTAS PARA IR A CHEQUEAR: ['auditorias']
```

Esa última línea es el producto. Una redacción no necesita saber que el hilo
está caliente: necesita saber qué preguntar.

Dos detalles de diseño que importan:

- **La deliberación se evalúa antes que el rechazo.** Un comentario que nombra
  una auditoría incumplida *y además* insulta vale por la auditoría.
- **La autocrítica va antes que el incumplimiento vago.** «Los delegados
  brillan por su ausencia, y mucha de la culpa es nuestra, los socios» tiene
  las dos cosas. El reproche es lo común; que alguien se incluya entre los
  responsables es raro. Si el orden fuera el inverso, la autocrítica quedaría
  siempre tapada por la queja que la acompaña.

---

## Los nombres propios: acá te freno

Proponés incorporar a **Néstor Gerosa, Graciela Iturburu y Roberto Mateos** al
registro de actores.

No lo hice, y no es timidez. Un consejero de la cooperativa ocupa un cargo
electivo en una entidad que le da luz y agua a todo el pueblo: **es un actor
público en ese rol y nombrarlo es legítimo.**

El problema es de dónde viene el dato. `Gerosa` e `Iturburu` aparecen porque un
vecino escribió *«Que lo paguen Gerosa _Iturburu!!»* en un comentario.

**El registro de actores no es una lista de menciones: es lo que el sistema da
por cierto al construir una nota.** Un nombre puesto ahí sin fuente formal se
convierte en «el consejero Fulano» dentro de una pieza publicada, sobre una
persona real, en un pueblo donde todos se conocen.

Un comentario que los nombra es una **imputación de un vecino**. Es un dato
valioso —y distinto de un hecho.

**Lo que sí necesito de vos:** conseguí la fuente formal. Memoria y balance de
la cooperativa, acta de asamblea, el sitio institucional, la nómina del consejo
publicada. Con eso entran con cargo y período, y entran bien. Si no aparece,
decímelo: quedan afuera y no pasa nada.

(Roberto Mateos es distinto: si Junyent lo cita **en la nota** como contador de
la cooperativa, eso ya es una fuente periodística publicada. Confirmame que la
mención está en el cuerpo de la nota web y lo agrego.)

---

## Lo que sí implementé de tu plan

- **`issues_esquel.cooperativa_16_octubre`** con las anclas y el contexto que
  propusiste. Tenías toda la razón: caía en `economia` por la palabra «tarifas»
  y así no había forma de construir el hilo histórico de la disputa. Verificado
  contra el título y el cuerpo reales: `[('cooperativa_16_octubre', 5.0)]`.
- La ficha limpia, el título completo y el cuerpo de `notas_web`: confirmado.

Y una cosa tuya que arreglé: `test_radar_deduplicacion_y_accionable_en_bd_real`
lee la base de producción y **fallaba fuera del VPS**. Es la misma familia del
problema que nos hizo creer que 516 pruebas pasaban. Ahora se saltea con motivo
visible en vez de dejar la suite roja.

---

## Lo que necesito, en orden

### 1. El truncamiento sobre las 199 publicaciones

```python
from app.core.senal_civica import truncamiento
print(truncamiento(publicaciones))   # con comentarios_declarados y _guardados
```

Es el número que gobierna todo lo demás.

### 2. Scraping profundo por permalink

Tu propuesta de abrir el permalink cuando hay ≥5 comentarios declarados es
correcta. Dos cosas al implementarlo:

- **Guardá `comentarios_declarados` siempre**, aunque no expandas. Sin ese
  número no se puede saber qué falta, y es lo que hace medible el problema.
- Andá con cuidado con el volumen de requests. No quiero que esto termine en un
  bloqueo. Si hay que priorizar, expandí sólo las publicaciones con señal —no
  las 199.

### 3. «Esquel Online» comentando: verificá qué es

El primer comentario del hilo viene de una cuenta llamada **Esquel Online**. Si
es otro medio local, es una variante de contaminación que `origen_texto` **no
detecta**: mi módulo encuentra a la página comentando en sus propias
publicaciones, no a un medio comentando en el de un competidor.

Decime qué es esa cuenta. Si es un medio, hay que agregar el caso.

### 4. Junyent candidato: es higiene editorial, no taxonomía

El comentario *«Próximamente intendente!!»* posiciona a Junyent como candidato a
intendente. Lo clasificaste como «polarización electoral» a catalogar.

Lo veo distinto y más importante: **la fuente principal de una nota sobre un
juicio a la cooperativa está siendo promovida como candidato en los comentarios
de esa misma nota.** Eso no es un tema para el clasificador: es una alerta para
quien edita. Cuando citemos a Junyent sobre la cooperativa, hay que saberlo.

Si te parece bien, lo implemento como una marca en la ficha —«esta fuente
aparece posicionada electoralmente en los comentarios»— y no como una clase de
comentario. Decime qué opinás.

### 5. Revisá el callejero (sigue pendiente de la v17)

`geografia_esquel.py`. Lo armé desde afuera y seguro tiene faltantes obvios
para cualquiera que viva en Esquel.

---

## Lo que no hay que hacer

- **No recalibres `senal_civica`** hasta que el scraping esté profundo.
- **No agregues los nombres de directivos** sin fuente formal.
- **No conviertas la deliberación en rechazo** agregando palabras al léxico.
  Si un comentario deliberativo no entra, el camino es ampliar `ROLES`,
  `OBLIGACIONES` o `_INCUMPLE` en `deliberacion.py`.
- **No cambies el proveedor de LLM.** Gemini Lite gratis, como está.

---

## Sobre tu pregunta de fondo

Leandro preguntó si «le estamos errando en algo» y si la información es
productiva. La respuesta honesta:

**Sí le estábamos errando, en las dos puntas.** Mediamos la conversación con un
scraper que ve el 24% de ella, y clasificamos lo que sí veíamos con una
taxonomía que no tenía casillero para el mejor material.

Lo bueno es que las dos cosas se descubrieron por lo mismo: **mirar un caso
real con atención**. Nueve comentarios pegados a mano valieron más que tres
rondas de razonamiento sobre datos agregados.

Ese es el método que hay que repetir.
