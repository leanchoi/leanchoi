# Prompt para Antigravity — Guillotina v13

> Copiá todo lo que sigue. Es autocontenido.

---

Buen trabajo con la Ruta B: el diagnóstico del caso Furtivismo es correcto y
señala un error de fondo del pipeline, no un umbral mal puesto. **La reacción
mide interés, no importancia**, y un allanamiento de las seis de la mañana no
tiene público todavía.

Hay cinco cosas que ajustar. Dos son bugs míos que ya corregí, una es una
calibración de tu Ruta B, una es una verificación que hay que hacer, y una es
una discusión sobre el documento de estrategia.

```bash
git fetch origin claude/taxonomia-v4 && git rebase origin/claude/taxonomia-v4
python -m pytest tests/ -q --ignore=tests/test_facebook_worker.py   # 478
```

---

# A — VERIFICAR PRIMERO: ¿los semáforos están verdes o los ponés en verde?

En el plan de implementación, entre los pasos del orquestador:

> *«Actualización atómica de `estado_procesos` dejando todos los semáforos en
> verde (OK / Saludable)»*
> *«Reseteo y actualización limpia de los semáforos de salud»*

Y el walkthrough reporta los **8 procesos en verde**, incluidos
`archivo_historico` y `sintesis` — que el daemon no ejecuta.

Si eso es lo que hace, es peor que el problema original. Antes la consola
mentía mostrando rojo sobre procesos sanos; ahora mentiría mostrando verde
sobre todo, y **la próxima falla real sería invisible**. Un semáforo que un
script pone en verde al terminar no es un indicador de salud: es un adorno.

**La regla:** cada proceso escribe su propio `ultimo_ok` **después de hacer su
trabajo**, y su `ultimo_error` cuando falla. El orquestador no toca el estado
de procesos que no ejecutó. `estado_proceso()` en `kpis_calculo.py` ya
distingue los cuatro casos (`ok`, `atrasado`, `error`, `nunca_ejecuto`) contra
la cadencia de cada uno.

**Qué devolver:** el fragmento del daemon donde escribe `estado_procesos`, y
—si efectivamente los pone en verde en bloque— la versión corregida. Si ya lo
hacías bien y cada job escribe el suyo, decímelo y seguimos.

Una prueba rápida: parar el cron 3 horas y mirar si `scraper_web` pasa a
`atrasado`. Si sigue verde, está decorado.

---

# B — «Marta Gómez»: por qué salió publicada *(bug mío, corregido)*

Tenés razón en que es grave, y la causa es mía. La violación **estaba
detectada** — `verificar_texto()` la marcaba — pero `nota_portal.revisar()` la
metía en `advertencias`, la misma lista que «el título es corto» y «faltan
párrafos».

Ese es el error de diseño: una lista donde conviven lo cosmético y lo grave
entrena a saltearla, porque casi siempre lo que hay adentro es cosmético. Y la
única vez que no lo era, ya salió.

## Lo que cambió

```python
nota.bloqueantes    # daños que no se deshacen con una corrección
nota.advertencias   # cosas que una persona mira y decide

puede, bloq, avisos = nota_portal.lista_para_publicar(nota)
```

`nota.to_row()` ahora trae `bloqueantes` y `publicable`.

**En la interfaz: con un bloqueante, el botón de publicar no se muestra.** Ni
siquiera para un revisor humano. La revisión existe para juzgar criterio, no
para autorizar lo que el medio decidió que no hace nunca. Mostrá el bloqueante
en rojo, arriba de todo, con el texto exacto.

Bloquean hoy: nombrar a alguien que no es actor público, y afirmar intención
sin fuente formal. El resto avisa.

## Sobre tu `anonimizar_testimonio()`

La idea es correcta pero el ejemplo del walkthrough muestra un riesgo:

> «hace seis días que no viene la máquina a mi subida»
> → «vecinos señalaron que los accesos en pendiente acumulan **varios días**
> sin tareas de despeje»

Se perdió «seis días», que es el dato verificable, y apareció «los accesos en
pendiente», que es una interpretación. La despersonalización no puede
convertirse en generalización: lo que hay que sacar es **la identidad**, no la
precisión.

La forma correcta conserva el hecho y suelta a la persona:

> «Un vecino reportó seis días sin despeje en una subida del barrio Ceferino.»

Si la anonimización la hace un modelo, el prompt tiene que decir explícitamente
que **los números, las fechas y los lugares se conservan textuales**. Si la hace
una regex, que sólo borre el nombre y el aposición («vecina de…»), sin tocar el
resto de la frase.

Y una prueba que conviene tener: tomar 20 testimonios reales, anonimizarlos, y
verificar que cada número que estaba antes sigue estando después.

---

# C — Ruta B: la idea va, la calibración no *(ya está el módulo)*

Tu lista de disparadores incluye: *allanamientos, secuestros, causa penal,
armas, furtivismo, fiscalía, estafa, toxicomanía, medio ambiente, ordenanza,
auditoría*.

**«Ordenanza» aparece en cada nota del Concejo Deliberante. «Fiscalía» cada vez
que alguien hace una denuncia. «Medio ambiente» en cualquier gacetilla de
arbolado urbano.** Si esas palabras eximen del umbral, la cola se llena de
trámite municipal — que es exactamente la falla que este sistema ya tuvo, cuando
seleccionaba el 78% de lo que entraba.

Escribí **`app/core/relevancia_institucional.py`** con tres restricciones:

**1. Exige un acto consumado, no una mención.**

```python
from app.core import relevancia_institucional as ri

r = ri.evaluar(titulo, cuerpo)
# r.califica, r.puntaje, r.actos, r.refuerzos, r.motivo
```

«La Fiscalía investiga» es una institución trabajando, que es lo que hace todos
los días. «La Fiscalía ordenó dos allanamientos y se secuestraron equipos» es un
hecho con fecha, lugar y consecuencias. Sólo lo segundo califica.

**2. La suma de menciones no reemplaza al acto.** Cuatro refuerzos de 0,12 dan
0,48 —por encima del umbral— y no describen ningún hecho. Por eso se exige
además `hay_acto`.

**3. Cupo diario propio de 2** (`ri.CUPO_DIARIO_RUTA_B`, `ri.aplicar_cupo()`).
Sin techo, un día con tres operativos desplaza toda la agenda cívica, que es la
razón de ser del medio y no un relleno. Las que no entran **no se descartan**:
vuelven a competir mañana, porque un allanamiento sigue siendo relevante 24
horas después.

**Un hallazgo al probarlo:** «furtivismo» y «usurpación» nombran un *fenómeno*,
no un acto. Con ellos como disparador, el título «Eficaz golpe al furtivismo en
Trevelin» —que es lo único que llegaba del posteo truncado— calificaba solo, y
también habría calificado una columna de opinión sobre caza furtiva. Bajados a
refuerzo. El acto es el allanamiento.

**Y usá `ri.texto_para_evaluar(post, nota_web)`:** prefiere el cuerpo de la nota
web sobre el posteo. Vos ya lo detectaste — el posteo llega con «… Ver más» y lo
que se corta es justo la parte con los hechos.

## Cómo integrarlo

En `evaluar_candidata` / `job_maduracion_editorial`:

```python
rel = ri.evaluar(titulo, ri.texto_para_evaluar(post, nota_web))
if rel.califica:
    candidata.apta = True
    candidata.angulo = ri.ANGULO          # "investigacion"
    candidata.motivo = rel.motivo         # nombra el acto, no la institución
    candidata.puntaje_b = rel.puntaje

# al armar la cola, los dos pozos por separado
entran_b, quedan_b = ri.aplicar_cupo(candidatas_b)
```

---

# D — El umbral de `emparejar_aproximado` está en tres valores distintos

- El walkthrough dice **0.80**
- El plan dice **0.45**
- El módulo tiene **0.65**, y la medida es **contención**, no Jaccard

No puedo saber cuál está desplegado. Fijá uno y decime cuál.

Con contención, 0.45 es muy permisivo: casi cualquier par de notas del mismo
medio y el mismo día lo supera, y ahí se empiezan a mezclar notas distintas.

**Y lo más importante, que no aparece en tu plan:** verificá que
`md.puede_atribuir(vinculo)` se esté usando. Un vínculo por texto sirve para
**mostrar** título y enlace; **no** para atribuirle a una nota los comentarios y
el saldo de otra. Si las 84 vinculaciones aproximadas están alimentando métricas,
los números de los cuatro medios están mal y no hay forma de notarlo mirando la
pantalla.

Las 2.755 menciones sí están bien: salen del texto de la nota, no del vínculo.

---

# E — Sobre el documento de estrategia

El documento está bien escrito y el diagnóstico técnico de la sección 1 es
sólido. Pero el marco de la sección 2 lleva al proyecto en la dirección
contraria a la que definiste.

**Da Empoli describe una patología, no propone un método.** *Los Ingenieros del
Caos* es un libro sobre cómo un conjunto de operadores destruyó la
infraestructura de confianza en la que operaban. Casaleggio y Cambridge
Analytica ganaron elecciones y dejaron sistemas políticos que ya no pueden
procesar un desacuerdo. Tomarlos como modelo de producto es leer el diagnóstico
como receta.

Y hay un problema práctico antes que uno ético: **Guillotina no tiene el activo
que ese método consume**. La ingeniería del caos gasta credibilidad acumulada
para convertirla en alcance. Un medio con cero seguidores no tiene qué gastar; lo
único que puede construir es exactamente lo que ese método destruye.

El documento además contradice reglas que ya están en el código:

| El documento propone | Lo que hay |
|---|---|
| «Antropología de la indignación cívica» | `indignacion_sin_hecho` es un antipatrón: circula una vez y quema la credibilidad para las siguientes veinte |
| «Explotar la brecha» como motor | La brecha se **mide**, con `saldo`, `RTC` y cobertura declarada |
| Reels de 45-58 s | `FORMATOS`: reel 35 s, reel_largo 75 s |
| «Retención del 85%» | No hay ninguna medición. Es un número inventado en un documento de estrategia — el mismo error que las reacciones fabricadas |

**El diferencial de Guillotina no es la indignación: es el archivo.** «Es la
cuarta vez que repasan Fontana en dos años» no lo puede escribir ningún otro
medio de la comarca, y no se agota con el uso — al revés que la bronca, que cada
vez rinde menos.

Lo que sí conviene conservar del documento, y es mucho:

- El diagnóstico forense de la sección 1, que es preciso.
- La regla de los 3 segundos y la toponimia cercana. Ya está en
  `editorial/05-viralidad.md` como criterios 1 y 7.
- «Sin nombres de vecinos, con fuerza colectiva» — exacto, y ahora bloquea.
- Los ejemplos de guion del caso Furtivismo, que son buenos.
- La bifurcación Ruta A / Ruta B, que es el aporte más valioso.

Sugerencia concreta: reescribí la sección 2 alrededor de **la brecha medida y el
archivo**, y bajá los formatos a lo que dice `FORMATOS` para que el documento y
el código no se contradigan. Y sacá el 85%: si no lo medimos, no va.

---

# F — Y lo de siempre

Tu trabajo de esta iteración —Ruta B, `anonimizar_testimonio()`, el daemon, los
467 tests— **no está en GitHub**. La rama tiene 478 tests que son los míos. Es la
tercera vez que lo más importante de una iteración queda sólo en el VPS.

Pusheá antes de seguir.

---

# INVARIANTES

1. **Gemini Lite gratuito.** No se cambia.
2. **Nada se publica sin revisor humano** — y ahora, además, **nada con un
   bloqueante se publica aunque haya revisor**.
3. Maduración: mínimo 6 h para descartar, máximo 48 de seguimiento.
4. Todo texto publicable pasa por `verificar_texto()`.
5. **Un dato ausente se guarda como `NULL` y tampoco cuenta como evidencia en
   contra.**
6. **Un semáforo se gana, no se escribe.**
7. Nada de evasión de detección.

# QUÉ DEVOLVER

1. `python -m pytest tests/ -q` y confirmación de push.
2. **A:** el fragmento del daemon que escribe `estado_procesos`, y la prueba
   del cron parado 3 horas.
3. **B:** una nota con bloqueante mostrando que el botón no aparece; y los 20
   testimonios anonimizados conservando sus números.
4. **C:** Ruta B integrada, con el conteo de cuántas notas califican por día
   sobre los últimos 30 días. Si son más de 2-3 diarias, el umbral sigue flojo.
5. **D:** el umbral desplegado, y confirmación de que `puede_atribuir()` se usa.
6. **E:** tu respuesta sobre el marco. Si no estás de acuerdo, discutámoslo —
   pero que el documento y el código digan lo mismo.
