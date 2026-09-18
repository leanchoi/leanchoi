# Reglas de negocio no negociables

Diez reglas del operativo, más una del módulo de audio. No son sugerencias: son requisitos del operativo. Cada una tiene que tener
un test que falle si se rompe. Este documento dice, para cada regla, **qué exige**,
**por qué existe**, **cómo la hace cumplir el código** y **qué test la cubre**.

> Estado: la fase 0 deja el andamiaje. La columna "test" indica el archivo previsto y la
> fase en la que se implementa. `tests/reglas/` es el único lugar donde viven.

---

## 1. Dos bases separadas

**Exige.** Schema `analitica` con las respuestas, sin ningún dato identificatorio.
Schema `identificada` con nombre, apellido, últimos dígitos del DNI, contacto y
domicilio. **No hay foreign key navegable entre ambos.** El único puente es el `ticket`
(UUID v7 generado en el cliente). Cruzar ambos lados requiere rol `admin`, y cada cruce
queda registrado en `audit_log` con usuario, timestamp y motivo escrito. Ninguna API
pública devuelve nada del schema `identificada`.

**Por qué.** Porque el relevamiento lo hace, casa por casa, gente del propio barrio. Si
las respuestas sobre seguridad, convivencia o necesidades pudieran atarse a un nombre y
una dirección con una consulta, el instrumento se vuelve un riesgo para el vecino y una
herramienta de presión. La separación es lo que permite prometer —y cumplir— que nadie
del municipio puede ver "qué contestó tal familia" sin dejar rastro.

**Cómo.** Dos schemas de Postgres distintos, sin constraint que los relacione. El acceso
al schema `identificada` pasa por un único módulo del servidor que exige rol `admin`,
recibe un motivo obligatorio y escribe en `audit_log` antes de devolver nada. Los
serializadores de las rutas públicas listan explícitamente los campos permitidos.

**Test** (`tests/reglas/01-bases-separadas.test.ts`, fase 1 y 4):
no existe ninguna foreign key entre schemas; un usuario no `admin` recibe 403 al
intentar el cruce; un cruce exitoso deja exactamente una fila nueva en `audit_log`;
ninguna respuesta de las rutas públicas contiene campos de `identificada`.

---

## 2. Consentimiento explícito

**Exige.** La encuesta no puede iniciarse sin registrar el consentimiento con la
finalidad declarada (Ley 25.326). El texto del consentimiento se versiona junto al
cuestionario y se guarda **qué versión aceptó cada vecino**.

**Por qué.** Es la ley, y además es la única forma honesta de pedirle a alguien media
hora de su tiempo y datos de su casa: diciéndole para qué se van a usar y quién los va a
ver. Versionarlo permite responder, dos años después, qué se le prometió exactamente a
esa persona.

**Cómo.** El campo `consentimiento_version` es obligatorio al crear la respuesta; sin él
la validación Zod falla en el cliente y en el servidor, y la constraint de la base
rechaza la fila. El texto vive dentro del JSON del cuestionario publicado, así que queda
atado a la versión.

**Test** (`tests/reglas/02-consentimiento.test.ts`, fases 2 a 4): una respuesta sin
consentimiento es rechazada en el cliente, en la API de sync y en la base; la versión
guardada coincide con la versión vigente al momento de la encuesta.

---

## 3. La no-respuesta es un dato obligatorio

**Exige.** El encuestador no puede saltear una vivienda. La cierra con un motivo
tipificado —`sin_moradores`, `rechazo`, `deshabitada`, `no_accesible`,
`volver_mas_tarde`— y el número de intento. La tasa de no-respuesta por barrio y motivo
es una métrica de primer nivel del tablero, no una nota al pie.

**Por qué.** Sin no-respuesta no hay cobertura, y sin cobertura los porcentajes mienten:
"el 80% pide más luminaria" no significa nada si no se sabe sobre cuántas viviendas
visitadas es ese 80%. Además distingue un barrio difícil de un encuestador que no fue.

**Cómo.** Una vivienda asignada solo pasa a estado cerrado por dos caminos: respuesta
completa o registro en `no_respuestas` con motivo del enum y `intento >= 1`. La app de
campo no ofrece ningún otro botón de salida.

**Test** (`tests/reglas/03-no-respuesta.test.ts`, fases 3 y 6): no se puede cerrar una
vivienda sin respuesta ni no-respuesta; el motivo fuera del enum es rechazado; el
tablero expone la tasa por barrio y motivo.

---

## 4. El acuse no promete

**Exige.** Toda comunicación automática al vecino acusa recibo y clasifica la demanda por
competencia: `municipal`, `provincial`, `nacional`, `privada`. El sistema **impide a
nivel de código** enviar una plantilla de tipo `compromiso` si la derivación no tiene
`orden_trabajo_nro` cargado.

**Por qué.** La forma más rápida de quemar un relevamiento es prometer lo que no se
puede cumplir, o hacerse cargo de lo que es de otra jurisdicción. Un acuse que dice "lo
recibimos y corresponde a la provincia" es información útil; uno que dice "lo vamos a
resolver" sin orden de trabajo es una deuda que alguien va a reclamar en la sede vecinal.

**Cómo.** La función de envío es la única puerta de salida y valida el par
(tipo de plantilla, derivación) antes de generar el mensaje: si el tipo es `compromiso` y
`orden_trabajo_nro` está vacío, lanza y no envía. En desarrollo el transporte es de
consola: no se envían correos reales.

**Test** (`tests/reglas/04-acuse-no-promete.test.ts`, fase 5): la plantilla `compromiso`
sin `orden_trabajo_nro` lanza y no produce envío; con orden de trabajo, envía; las
plantillas de `acuse` y `derivacion` no requieren orden; toda comunicación lleva
competencia asignada.

---

## 5. Regla de admisión de preguntas

**Exige.** Cada pregunta lleva un campo obligatorio `decision`: qué decisión concreta
toma el área con esa respuesta. Sin `decision` el JSON no valida y la versión no se
publica.

**Por qué.** Es el filtro que evita el cuestionario de 90 preguntas donde cada área
agrega "lo que estaría bueno saber". Si nadie puede escribir qué va a hacer distinto
según la respuesta, la pregunta le está robando tiempo al vecino.

**Cómo.** El esquema Zod del cuestionario exige `decision` como string no vacío en cada
pregunta. La publicación de una versión corre esa validación y falla con el listado de
preguntas sin decisión.

**Test** (`tests/reglas/05-regla-admision.test.ts`, fase 2): una pregunta sin `decision`
—o con `decision` vacía— hace fallar la validación y la publicación, nombrando la
pregunta.

---

## 6. Techo de 12 minutos

**Exige.** Cada pregunta declara `segundos_estimados`. Si el total supera **720
segundos**, la publicación falla con error explícito. Además se mide y guarda la duración
real de cada encuesta.

**Por qué.** En la puerta, parado, con el mate a medio tomar, doce minutos es lo que hay.
Pasado ese punto la gente contesta cualquier cosa para terminar, y los datos de las
últimas preguntas valen menos que el tiempo que costaron.

**Cómo.** La función de publicación suma `segundos_estimados` de todas las preguntas
(incluidos los bloques de área) y aborta si supera 720. La duración real se calcula del
timestamp de apertura y cierre de cada encuesta y alimenta el tablero: si la estimación
miente, se ve.

**Test** (`tests/reglas/06-techo-12-minutos.test.ts`, fase 2): un cuestionario de 721
segundos no publica y el error dice cuánto se pasó; uno de 720 publica; la duración real
se persiste.

---

## 7. Núcleo inmutable

**Exige.** Diez preguntas marcadas `core: true` que no pueden cambiar de redacción ni de
opciones entre versiones.

**Por qué.** Sirve para dos cosas que son el valor de largo plazo del operativo: comparar
barrios entre sí y repetir el relevamiento el año que viene. Si cambia la redacción,
cambia la respuesta, y no se puede saber si un barrio mejoró o si solo se preguntó
distinto.

**Cómo.** La publicación de una versión nueva compara el núcleo contra la versión
anterior (texto y opciones, normalizados) y falla si alguno difiere. Agregar o quitar
preguntas del núcleo también falla.

**Test** (`tests/reglas/07-nucleo-inmutable.test.ts`, fase 2): cambiar el texto de una
pregunta núcleo hace fallar la publicación; cambiar una opción también; los bloques de
área sí pueden cambiar libremente.

---

## 8. Bloque sensible autoadministrado

**Exige.** Las preguntas marcadas `autoadministrada: true` —seguridad, convivencia,
evaluación de la propia junta vecinal— se contestan en **modo vecino**: pantalla limpia,
el encuestador entrega el celular, y al cerrar el bloque el encuestador **no puede volver
atrás a verlo**.

**Por qué.** Porque el encuestador suele ser el presidente de la junta vecinal del barrio,
y nadie le va a decir en la cara que la junta funciona mal, o que el problema de
seguridad es el vecino de enfrente. Sin esta separación, ese bloque mide simpatía, no
realidad.

**Cómo.** El modo vecino es una pantalla distinta, sin navegación hacia atrás ni resumen.
Al cerrar el bloque las respuestas quedan selladas en el almacenamiento local y la
interfaz del encuestador no vuelve a mostrarlas: ni en la revisión final, ni en el
detalle de la encuesta, ni en la cola de sincronización.

**Test** (`tests/reglas/08-modo-vecino.test.ts`, fase 3): cerrado el bloque, ninguna
pantalla del encuestador expone esas respuestas; no existe ruta ni estado que permita
reabrirlo; el rol `encuestador` tampoco las ve en el servidor.

---

## 9. Offline-first real

**Exige.** Toda la app de campo funciona sin conexión. El ticket se genera en el cliente.
La sincronización es **idempotente** y **append-only**: nunca sobrescribe. Si el celular
se queda sin batería a mitad de una encuesta, al volver se retoma donde estaba.

**Por qué.** Hay barrios de Esquel donde no hay señal, y el antecedente hecho con Google
Forms se caía justamente ahí. Un sistema que necesita señal para guardar una respuesta no
sirve para este operativo.

**Cómo.** Service worker con precarga de la app; Dexie sobre IndexedDB para el estado y
la cola de salida (outbox); el ticket es un UUID v7 generado en el dispositivo, así que
la identidad del registro no depende del servidor. El endpoint de sync usa el ticket como
clave de idempotencia: reenviar el mismo evento no duplica ni pisa; los conflictos se
resuelven agregando eventos, no editando filas. El estado parcial de la encuesta se
persiste en cada paso.

**Test** (`tests/reglas/09-offline-sync.test.ts`, fases 3 y 4): enviar el mismo lote dos
veces deja la base igual que enviarlo una vez; un evento viejo no pisa uno nuevo; una
encuesta interrumpida se recupera completa desde IndexedDB.

---

## 10. Cuestionario público

**Exige.** Ruta pública `/cuestionario`, sin login, con la versión vigente completa en
texto plano, fecha de publicación y changelog de versiones.

**Por qué.** Es el mecanismo de transparencia del operativo. Cualquier vecino, periodista
o concejal puede leer exactamente qué se pregunta y qué se hace con cada respuesta, sin
pedir permiso a nadie. También es la defensa del propio equipo cuando circule la versión
deformada de qué "andan preguntando" los del municipio.

**Cómo.** La ruta renderiza el JSON publicado de la versión vigente —incluidos el texto
del consentimiento, la `decision` declarada de cada pregunta y los segundos estimados— y
lista todas las versiones anteriores con su fecha.

**Test** (`tests/reglas/10-cuestionario-publico.test.ts`, fase 2): la ruta responde 200
sin sesión; contiene todas las preguntas de la versión vigente; muestra fecha y
changelog; no expone respuestas de vecinos.

---

## 11. El audio es temporal (regla del módulo de audio)

**Exige.** Las respuestas abiertas se graban, pero el audio **no se guarda**. Los bytes
existen únicamente hasta que la desgrabación queda asegurada —escrita y releída de la
base—; ahí se borran. Si no se pudo desgrabar, el audio sobrevive como mucho
`AUDIO_TTL_HORAS` y se borra igual. Ninguna ruta HTTP devuelve los bytes de un audio,
ni siquiera para el rol `admin`.

**Por qué.** Lo que el operativo usa es el texto: sobre el texto se agrupa, se cita y se
arma el informe de barrio. Guardar además el audio significa administrar miles de
archivos pesados que ya no aportan nada, con el volumen creciendo durante todo el
relevamiento. Se procesa y se descarta.

**Cómo.** Todo el ciclo está en `src/lib/audio/pipeline.ts`, que es el único camino por
el que un audio se guarda o desaparece. La desgrabación está detrás de la interfaz
`TranscriptionProvider` (stub determinístico por defecto, Gemini o cualquier servicio
compatible con la API de OpenAI, incluido un Whisper autohospedado). La purga borra
bytes pero nunca filas: queda el hash, el tamaño, la duración, el motivo y el momento,
más un asiento en `audit_log`.

**Test** (`tests/reglas/11-audio-efimero.test.ts`): el audio se borra al asegurarse la
transcripción; NO se borra si la desgrabación falla, si el texto viene vacío o si la
escritura no se confirma; se borra igual al vencer el TTL; la fila sobrevive a la
purga; ninguna ruta de la API devuelve bytes de audio.

---

## Roles y qué ve cada uno

| Rol                                        | Ve                                                  | No ve                                     |
| ------------------------------------------ | --------------------------------------------------- | ----------------------------------------- |
| `encuestador`                              | Su barrio asignado, sus propias cargas              | Respuestas de otros, contactos, agregados |
| `coordinador_barrio` (presidente de junta) | Agregados de **su** barrio                          | Respuestas individuales, contactos        |
| `area`                                     | Su bloque de preguntas, agregado, todos los barrios | Otros bloques, contactos, individuales    |
| `conduccion`                               | Todo agregado, derivaciones, cobertura              | Datos identificatorios                    |
| `admin`                                    | Todo, incluido el schema `identificada`             | — (cada acceso queda auditado)            |

Acceso del equipo: usuario y contraseña, sesión en cookie `httpOnly`.
Acceso del vecino para consultar su ticket: **apellido + últimos 3 dígitos del DNI**, sin
crear cuenta.

---

## Dato, no validación dura

Se capturan latitud, longitud y precisión del GPS al **abrir** y al **cerrar** cada
encuesta. Es dato de calidad del relevamiento, no un requisito: **nunca** se bloquea una
carga porque el GPS falló, esté apagado o dé una precisión mala. En Esquel eso pasa, y
perder la encuesta por eso sería peor que no tener la coordenada.
