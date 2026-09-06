# Prompt para Antigravity — Guillotina v14

> Copiá todo lo que sigue.

---

Esta iteración estuvo bien. Los semáforos ahora se ganan, la prueba del cron
detenido es la correcta, el enforcement de `puede_atribuir()` está verificado
contra la base (`COUNT(*) = 0`), y la revisión del documento de estrategia es
seria — sacar el 85% inventado y bajar las duraciones a `FORMATOS` es
exactamente lo que correspondía.

Probé lo que subiste y hay tres cosas que corregir. Ya están hechas; hay que
integrarlas y verificar una.

```bash
git fetch origin claude/taxonomia-v4 && git rebase origin/claude/taxonomia-v4
python -m pytest tests/ -q --ignore=tests/test_facebook_worker.py   # 492
```

---

# A — La página policial estaba entrando por Ruta B

Tu medición dio 2,67 candidatos por día y la leíste como «dentro del rango
objetivo». Miré los 8 candidatos que listaste y uno es *«causa por hurto
comarcal»*. Eso me hizo probar el caso general:

```
Detuvieron a un hombre por el robo de una bicicleta   → CALIFICA (0.35)
Un detenido tras una pelea en un boliche              → CALIFICA (0.35)
Causa por hurto: hay un detenido en la comarca        → CALIFICA (0.47)
```

`detención` pesaba 0,35 y actuaba como disparador solo. **Los medios locales
publican detenciones todos los días**, así que con esa regla la cola se llena
de página policial — la misma falla que «ordenanza», con otra palabra.

Una detención vale cuando hay **proceso detrás** (allanamiento previo,
imputación formal) o **escala** (una estructura desarticulada). Sola, es el
parte diario.

## Lo que cambié

- `detención` baja a **0,18** — refuerzo, no dispara sola.
- Se agrega **«estructura desarticulada»** (0,32) como acto propio, para
  cubrir el caso de escala: *«desarticularon una banda dedicada a…»*.

Resultado sobre casos reales:

```
RUTINA  no    0.18   []                                  robo de bicicleta
RUTINA  no    0.18   []                                  pelea en un boliche
RUTINA  no    0.30   []                                  causa por hurto
REAL    SÍ    1.00   [allanamiento, secuestro]           furtivismo Trevelin
REAL    SÍ    0.85   [estructura desarticulada, imputación]  banda robo ganado
REAL    SÍ    0.75   [allanamiento, imputación]          morfina hospital
```

**Volvé a correr la medición de 30 días con esto.** Si el número baja de 2,67 a
algo cerca de 1 por día, está bien calibrado: la Ruta B es una presencia
constante y menor, no la mitad de la agenda.

---

# B — La anonimización tenía cuatro defectos, y uno es grave

Los 20 casos de tu tabla pasan, pero probé fuera de esa lista.

## B.1 — El grave: convierte funcionarios en vecinos

```
IN : El gerente de FríoSur, Roberto Salinas, confirmó el cierre de la planta
OUT: El gerente de FríoSur, un vecino, confirmó el cierre de la planta
```

Eso es **una afirmación falsa**, y es peor que el problema que veníamos a
resolver. El registro tiene 23 actores; cualquier figura pública que todavía no
esté cargada —un gerente, un abogado, el titular de una cámara— cae en la
trampa. Y como `anonimizar_testimonio()` se aplica también a `hechos`, entra en
párrafos que no son testimonios.

**La corrección:** un nombre precedido de un rol (`gerente`, `titular`,
`abogado`, `apoderado`, `dueño`, `comisario`, `fiscal`, `presidente`…) no se
toca. Se deja, y `verificar_texto()` lo marca como **bloqueante** para que una
persona decida si corresponde nombrarlo.

Esa es la salida correcta: ante la duda, frenar y preguntar, no reescribir en
silencio. Silenciar un nombre produce texto falso; bloquear produce una
revisión.

## B.2 — Aplanaba el género

```
IN : Marta Gómez, vecina del Ceferino, advirtió que hace 6 días no sube la máquina
OUT (antes) : Un vecino del Ceferino advirtió…
OUT (ahora) : Una vecina del Ceferino advirtió…
```

**Once de los veinte testimonios de tu propia tabla vienen de mujeres.**
Atribuirle a «un vecino» lo que dijo una vecina no protege más a nadie: sólo
hace el texto menos exacto, que es justo lo que la anonimización no puede
permitirse.

## B.3 — Anonimizaba la mitad del nombre

```
IN : Juan Carlos Pérez vecino de Badén denunció 48 horas sin luz
OUT (antes) : Un vecino Pérez vecino de Badén denunció 48 horas sin luz
```

`RX_NOMBRE_RAW` toma de a dos palabras, así que con nombres de tres partes
**el apellido seguía publicado**. Ahora el patrón toma de 2 a 4 palabras.

Este caso no estaba en tu tabla de 20 y es frecuente en la comarca.

## B.4 — Dos personas quedaban indistinguibles

```
IN : La bronca es con Marcelo Díaz y con Ana Ruiz por igual
OUT (antes) : …con un vecino y con un vecino por igual
OUT (ahora) : …con un vecino y con otro vecino por igual
```

Y un detalle de forma: `«Según contó un vecino , el corte»` dejaba un espacio
huérfano antes de la coma. Corregido.

## Qué verificar

Tu prueba de retención de números sigue pasando (la agregué al repo con cuatro
casos más). Pero agregá esta: **tomá 20 testimonios donde aparezca alguien con
cargo o rol** —un funcionario, un gerente, un abogado— y verificá que ninguno
se convierte en «un vecino».

---

# C — `puede_atribuir()` está bien, pero cuidado con aplicarlo de más

Tu enforcement es correcto y la auditoría en base lo prueba. Pero hay una
consecuencia que conviene revisar.

Si el vínculo aproximado **nunca** asigna `note_id`, entonces para un posteo
emparejado sólo por texto no hay forma de llegar al cuerpo de la nota web. Y
`ri.texto_para_evaluar(post, nota_web)` recibiría `nota_web=None`, evaluaría
sobre el titular truncado, no encontraría ningún acto consumado — **y el
furtivismo volvería a descartarse**. El caso que motivó toda la Ruta B.

Los dos permisos responden preguntas distintas:

| | Si nos equivocamos |
|---|---|
| **Leer el cuerpo** | Evaluamos mal una vez, y una persona lo ve en la cola |
| **Atribuir métricas** | El número queda en la base, alimenta promedios, y nadie puede notarlo mirando la pantalla |

Agregué **`md.puede_usar_texto(vinculo)`**, que devuelve `True` también para el
vínculo aproximado. El vínculo por texto **presta el texto y el título; no
presta los números**.

**Verificá cómo resolvés hoy el cuerpo de la nota web para un posteo aproximado.**
Si es vía `canonical_url` o `titulo_aproximado`, está bien y sólo hay que usar
`puede_usar_texto()` para que la intención quede explícita en el código. Si no
hay forma, hay que agregarla — por ejemplo una columna `note_id_aproximado`,
separada de `note_id`, que sirve para leer y nunca para unir métricas.

Y decime, con el caso concreto: `fb_fmdellago_e58b9f018f73` ¿se emparejó por URL
o por texto?

---

# D — El documento de estrategia

La reescritura de la sección 2 quedó bien. Dos observaciones menores:

1. **`RTC` está mal definido** en la línea 107: decís «Ratio Tensión/Comentarios
   ajustado por volumen». Es **Ratio de Tensión Cívica** —
   `(críticas + α·μ) / (respaldos + α)` con α=25, una razón crítica/respaldo con
   shrinkage empírico-bayesiano. No es un ratio sobre comentarios.

2. La Sección 3.1 lista **5 párrafos** para la nota del portal; `nota_portal.py`
   arma la secuencia hecho → detalle → reacción → testimonios → archivo →
   pregunta. Es la misma idea con distinto conteo. Alineá el documento con el
   código o al revés, pero que no digan cosas distintas: alguien va a leer uno y
   programar el otro.

Fuera de eso, coincido con la reescritura y me parece que quedó mejor
argumentada que mi objeción original.

---

# INVARIANTES

1. Gemini Lite gratuito.
2. Nada se publica sin revisor **y nada con bloqueante se publica aunque haya
   revisor**.
3. Maduración: 6 h mínimo, 48 h máximo.
4. Todo texto publicable pasa por `verificar_texto()`.
5. Un dato ausente se guarda como `NULL` y no cuenta como evidencia en contra.
6. Un semáforo se gana, no se escribe.
7. **Ante la duda con un nombre, se bloquea — no se reescribe.**
8. Nada de evasión de detección.

# QUÉ DEVOLVER

1. `pytest` y confirmación de push.
2. **A:** la medición de 30 días con `detención` como refuerzo. Cuántos
   candidatos Ruta B por día ahora.
3. **B:** 20 testimonios con personas *con cargo*, mostrando que ninguna se
   convierte en «un vecino».
4. **C:** cómo se resuelve hoy el cuerpo web para un posteo aproximado, y si
   `fb_fmdellago_e58b9f018f73` se emparejó por URL o por texto.
5. **D:** el documento con `RTC` corregido y los párrafos alineados.
