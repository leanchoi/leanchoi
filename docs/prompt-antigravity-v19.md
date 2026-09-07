# Guillotina — instrucciones v19

Traé `claude/taxonomia-v4`. Commit `547fb01`, **592 pruebas en verde, 1 salteada**.

**Sí, avanzamos con el plan.** Los dos frentes están bien separados y el orden
es correcto. Tres correcciones antes de que arranques, y las tres importan.

---

## 1. El 20,8% no es el número. La pérdida real es el doble

Corriste `truncamiento()` y obtuviste:

```
declarados: 342, guardados: 271, prop_perdida: 0.208
```

Ese número está mal, y la culpa es de mi función: no dije que
`comentarios_guardados` tiene que contar **sólo comentarios de vecinos**.

Vos mismo encontraste que el 45% de las filas de `social_comments` son copetes
del propio medio. Facebook **no los cuenta** como comentarios. Entonces estás
comparando 342 comentarios reales contra 271 filas de las cuales casi la mitad
no son comentarios:

```
si 30% de las filas es texto de medio -> 190 reales -> perdido 44,5%
si 45% de las filas es texto de medio -> 149 reales -> perdido 56,4%
```

**La pérdida real está entre el 45% y el 56%, no en el 21%.**

Esto importa por una razón práctica: la versión optimista del número es la que
hace que nadie arregle el scraper. Un 20% suena tolerable; un 56% es una
emergencia.

Y tu hallazgo sobre las calientes queda igual de firme y sigue siendo el peor:
**12 de 17 truncadas, 70,6%.**

**Lo que te pido:** corré `origen_texto.separar()` primero y volvé a correr
`truncamiento()` con `comentarios_guardados` contando sólo el grupo de vecinos.
Pasame ese número. La función ahora avisa si sospecha que le pasaron filas
crudas (`incluye_texto_del_medio`).

---

## 2. «Esquel Online» no va a una lista de exclusión

Proponés: *«Añadir Esquel Online a la exclusión de cuentas en origen_texto.py»*.

No lo hice así, por dos razones.

**No generaliza.** Mañana comenta otro portal y volvemos a empezar. La lista
negra crece de a un nombre por incidente y nunca está al día.

**Y tira un dato.** Mirá lo que escribieron:

> «Aca hay responsables entre los que manejan la Cooperativa 16 de Octubre que
> tienen que hacerse cargo en forma personal con su patrimonio...»

Eso no es una promo. Es **otro medio de la ciudad fijando posición editorial**
sobre la cooperativa, en el hilo de un colega. No es voz ciudadana —no puede
contar como señal cívica— pero que un medio local editorialice sobre un hecho
es parte de la historia de ese hecho.

Así que hay un **tercer origen**:

```python
ORIGEN_VECINO      # cuenta como señal cívica
ORIGEN_MEDIO       # la página en su propio muro (el copete)
ORIGEN_OTRO_MEDIO  # un colega comentando: contexto, no señal
```

`separar()` ahora devuelve **tres** grupos y nada se descarta. El
reconocimiento va por `medios.medio_de_cuenta()`, un registro de cuentas
verificadas, con el **id antes que el nombre** — los nombres se copian, los ids
no.

Al implementar: si `separar()` se llama en algún lado esperando dos valores, se
rompe. Buscá `separar(` antes de desplegar.

---

## 3. Junyent: la bandera va en la ficha, y también detectó otra cosa

Coincidimos, así que lo implementé: `app/core/higiene_editorial.py`.

Dos niveles, y la diferencia es concreta:

- **alerta** — el comentario **nombra** a la fuente y la posiciona.
- **aviso** — posiciona sin nombrar. El caso real («Próximamente intendente!!»
  a secas) cae acá. En un hilo casi siempre se refiere a quien habla en la
  nota, y ese «casi siempre» es lo que hay que decirle a quien edita en vez de
  resolverlo por él.

La bandera **trae la evidencia** y **no baja ningún puntaje**. Que a alguien lo
quieran de intendente no es un defecto, y tratarlo como tal sería tomar
partido.

**Y encontró algo que no fui a buscar.** En ese hilo, 2 de 4 comentarios
respaldan a la persona sin discutir el hecho:

```
[AVISO] 2 de 4 comentarios respaldan a la persona sin discutir el hecho:
        el hilo mide adhesión, no debate
```

Eso cambia qué significa el volumen. Veinte comentarios diciendo «grande» no
son conversación sobre la cooperativa. Contarlos como repercusión del tema
sería confundir una hinchada con un debate — y es un modo de inflar métricas
que no habíamos previsto.

---

## 4. El callejero: gracias, era lo único que no se podía hacer desde afuera

Cargué todo lo que pasaste y funciona:

```
holdich y alberdi        -> esquina
canadon de borquez       -> barrio
arroyo esquel            -> referencia
la trochita              -> referencia
ap iwan al 800           -> calle
nahuelpan                -> localidad
```

**Nahuelpan lo puse como localidad, no como barrio.** Es una comunidad con
identidad propia, y la diferencia decide la escala en `ambito` — que a su vez
decide si una pieza se publica. Si te parece que debería ser barrio, decímelo,
pero creo que corresponde así.

`Bórquez` quedó suelto además de «Cañadón de Bórquez» porque así se lo nombra
en la conversación.

---

## 5. Sobre el Frente Taller: de acuerdo, con un orden

Tus tres bugs son reales y todos tuyos de arreglar:

1. **Base64 y tags publicitarios en el cuerpo.** Un placeholder de 20.000
   caracteres no sólo rompe la legibilidad: envenena cualquier clasificador que
   lea ese texto. Es el más urgente de los tres.
2. **`reel_largo` y `carrusel` ignorados por el endpoint.** El `if formato in
   (...)` que no los incluía, devolviendo `None` y mostrando `0s`.
3. **Doble encoding de las escenas.** JSON dentro de JSON.

Sobre el punto 4 —integrar la deliberación en `nota_portal`— **sí, y es lo más
valioso del frente Taller**, pero pedile a la nota que use lo que ahora existe:

```python
from app.core.deliberacion import analizar, pistas_verificables
```

La nota no tiene que decir «los vecinos están enojados». Tiene que decir **qué
afirman que no se hizo**, que en este caso es una sola cosa y es una nota
entera: las auditorías anuales.

Y respetá lo de siempre: **la nota no menciona que la información viene de
comentarios ni nombra al medio de origen.** Eso es información nuestra.

---

## 6. Lo que necesito, en orden

1. **El truncamiento recalculado** sobre vecinos únicamente (§1). Es el número
   que gobierna si podemos calibrar algo.
2. **Scraping profundo por permalink** en las 17 calientes. No las 199 — cuidá
   el volumen de requests, no quiero un bloqueo.
3. **Guardá siempre `comentarios_declarados`**, aunque no expandas. Sin ese
   número el problema es invisible.
4. Los tres bugs del Taller, en el orden de arriba.
5. **`Roberto Mateos`**: confirmame que Junyent lo cita en el **cuerpo de la
   nota web** como contador de la entidad, y lo agrego. Gerosa e Iturburu
   siguen afuera hasta que haya acta o nómina.

---

## Lo que no hay que hacer

- **No recalibres `senal_civica`** hasta tener scraping profundo. La función se
  niega sola, y si la forzás estarías ajustando las constantes a la profundidad
  del scraper.
- **No conviertas la deliberación en rechazo** agregando palabras al léxico.
- **No excluyas cuentas por nombre.** Si aparece otro medio comentando,
  agregalo a `medios.OTROS_MEDIOS` con su id verificado.
- **No cambies el proveedor de LLM.** Gemini Lite gratis, como está.

---

## Una última cosa

De los cuatro hallazgos grandes de esta ronda, **tres salieron de tus corridas
contra la base real** y uno de leer un hilo de nueve comentarios con atención.
Ninguno salió de razonar sobre agregados.

El error del 20,8% es del mismo tipo: un número correcto sobre el dato
equivocado. Se detecta cruzándolo con otro dato tuyo —el 45% de contaminación—,
no pensándolo mejor.

Seguí trayendo números crudos aunque parezcan cerrados. Los cruces son donde
aparecen las cosas.
