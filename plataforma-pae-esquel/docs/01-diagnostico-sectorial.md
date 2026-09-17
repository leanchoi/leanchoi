# 01 · Diagnóstico: por qué fallan los subsidios educativos sin trazabilidad

## 1. El problema de fondo: se confunde rendir con evaluar

Toda transferencia pública tiene cuatro niveles de medición. Los programas municipales
casi siempre se detienen en el segundo.

```
INSUMO      →   PRODUCTO     →   RESULTADO       →   IMPACTO
$ ejecutado     N° de becas      % que termina       + ingreso de por vida
                entregadas       el ciclo lectivo    + arraigo local
                                                     - dependencia futura

└── acá rinde ──┘                └──── acá nadie mide ──────────────┘
    Contaduría
```

La **rendición contable** demuestra que el dinero se gastó como se dijo. Es necesaria y
no es suficiente: no dice nada sobre si el gasto sirvió. Cuando llega la discusión
presupuestaria, un programa que solo puede mostrar insumos y productos pierde contra
cualquier obra pública que se pueda fotografiar.

**Consecuencia política directa:** la ausencia de medición de resultados no es neutral.
Deja al programa estructuralmente indefenso. El primer beneficio de Trocha no es
eficiencia: es **capacidad de defensa**.

---

## 2. Las siete fallas metodológicas

### F1 · El padrón es una foto, no una película

La elegibilidad se valida una vez, al inscribirse, y se asume estable durante diez meses.
Pero la vulnerabilidad es dinámica: una familia pierde un ingreso en mayo, otra lo
recupera en julio, un estudiante se muda, otro abandona en agosto y sigue cobrando hasta
diciembre.

Un padrón estático garantiza dos errores simultáneos y crecientes:

| Error | Qué es | Costo |
|---|---|---|
| **Error de inclusión** (*filtración*) | Alguien cobra sin corresponder | Fiscal y reputacional |
| **Error de exclusión** (*subcobertura*) | Alguien que corresponde no cobra | Social — y es el más grave, porque es invisible |

La discusión pública se obsesiona con el primero. La política pública seria se preocupa
más por el segundo: no genera escándalo, no aparece en el diario, y es el que realmente
mide si el programa cumple su función.

### F2 · La licuación por inflación es un recorte que nadie decidió

Este es el hallazgo más incómodo del diagnóstico y conviene decirlo con todas las letras.

Un programa con **monto nominal fijo** y **tope de ingresos nominal fijo**, en un contexto
inflacionario, hace dos cosas por sí solo:

1. **Reduce la ayuda real mes a mes.** Lo que en marzo compraba los apuntes y el
   transporte, en noviembre compra la mitad.
2. **Expulsa beneficiarios sin resolución administrativa.** Si el tope de ingresos del
   grupo familiar queda congelado mientras los salarios nominales suben, familias que
   siguen siendo igual de vulnerables en términos reales quedan fuera del programa por
   haber superado un umbral que perdió sentido.

> El efecto combinado es un **ajuste automático, regresivo y silencioso**. Nadie lo
> firmó. No figura en ningún acto administrativo. Y sin embargo ocurre todos los meses.

La contracara es la oportunidad política: **corregirlo no es gastar más, es dejar de
recortar sin querer.** Una fórmula de actualización aprobada una sola vez convierte una
decisión política recurrente y conflictiva en una regla técnica que se aplica sola.
Ver `adr/ADR-004`.

### F3 · La contraprestación sin logística no existe o no se puede probar

Cuando la obligación comunitaria se registra en una planilla firmada por un referente
barrial, el municipio queda en la peor posición posible: **tiene la obligación pero no
la prueba**.

La consecuencia no es que los estudiantes no cumplan —en general cumplen—. La
consecuencia es que el municipio **no puede demostrar que cumplieron**. Y el riesgo es
brutalmente asimétrico:

- Si todo funciona bien, nadie se entera. Ganancia cero.
- Si un solo caso sale en los medios, el programa entero queda bajo sospecha y la
  respuesta institucional es "estamos revisando". Pérdida total.

Además, el registro en papel impide lo único que daría valor al esfuerzo: **agregarlo**.
Nadie puede decir hoy cuántas horas de trabajo comunitario recibió Esquel el año pasado,
en qué barrios, ni en qué consistieron. Es un activo público enorme que se produce y se
tira.

### F4 · La rendición de gastos es un ritual costoso de bajo valor

Pedir comprobantes mensuales de gastos genera:

- **Costo de cumplimiento** para la familia: juntar tickets, escanear, presentar, viajar.
- **Costo de procesamiento** para el municipio: recibir, revisar, archivar, reclamar.
- **Valor informativo cercano a cero**: saber que alguien compró útiles no dice nada
  sobre si está aprendiendo, ni sobre si va a terminar el año.

Es control de medios donde hace falta seguimiento de fines. La pregunta correcta no es
*"¿en qué gastaste?"* sino *"¿seguís cursando y cómo te está yendo?"*.

> **Implicancia de diseño:** Trocha no propone eliminar la rendición de un plumazo —es
> una decisión del área, y puede haber razones normativas—. Propone **reemplazar su peso
> relativo**: que la condición vinculante sea la regularidad académica verificada, y que
> la rendición, si se conserva, sea por muestreo y con carga desde el celular.

### F5 · El asistencialismo pasivo se autoperpetúa

Hay dos contratos implícitos posibles:

| Contrato pasivo | Contrato activo |
|---|---|
| "Te doy plata, mostrame facturas" | "Te acompaño hasta que termines" |
| La relación se mide en pesos transferidos | La relación se mide en trayectoria sostenida |
| El éxito del programa es pagar en término | El éxito del programa es que dejes de necesitarlo |
| El beneficiario es receptor | El estudiante es protagonista |

El PAE ya declara aspirar al segundo modelo —"es mucho más que una beca... una relación
de acompañamiento y seguimiento"—. **El problema no es la intención, es la
instrumentación:** no existe la herramienta que permita sostener acompañamiento real
sobre cientos de trayectorias con un equipo de pocas personas. Eso es exactamente lo
que hace el software.

### F6 · Desconexión entre la formación financiada y la economía local

El municipio financia carreras sin saber:

- qué se estudia, con qué nivel de detalle y dónde;
- qué demanda de perfiles tiene realmente la economía de Esquel;
- qué pasa con el egresado después del título.

El resultado es una **transferencia de capital humano no medida**: Esquel invierte en
formación y el retorno se realiza en otra ciudad. Para un municipio cordillerano con una
estructura económica concentrada en turismo, administración pública, salud, comercio,
forestal y servicios, la fuga de jóvenes formados no es un problema social difuso: es el
principal problema de desarrollo económico de largo plazo.

**Ningún municipio de la región reporta hoy una tasa de arraigo de sus becarios.** El
primero que lo haga define el estándar regional.

### F7 · El conocimiento crítico vive en dos cabezas

En programas de esta escala, el saber operativo —quién es quién, qué caso tiene qué
historia, cómo se resuelve cada excepción— reside en una o dos personas del área. No
está escrito en ningún lado.

Esto produce un **riesgo de continuidad severo**: una licencia médica, una renuncia o un
cambio de gestión y el programa pierde memoria institucional. Es, además, la razón por la
cual las áreas se resisten a los sistemas: porque el sistema hace explícito un saber que
hoy es fuente de poder personal.

> **Implicancia política:** este punto explica el 80% de la resistencia que vas a
> encontrar, y no se resuelve con argumentos técnicos. Se resuelve garantizándole a la
> persona que hoy tiene ese saber que el sistema la convierte en autoridad, no en
> prescindible. Ver `interno/03-venta-interna-aldana.md`.

---

## 3. Los cuellos de botella administrativos del municipio mediano

Son estructurales, se repiten en toda Latinoamérica y hay que diseñar **con** ellos, no
contra ellos.

| Cuello de botella | Manifestación | Cómo lo aborda Trocha |
|---|---|---|
| **Ventanilla única de papel** | Todo entra por Mesa de Entradas en una ventana corta de febrero, con colas y digitación manual posterior | Inscripción digital con número de trámite; el papel queda como canal de excepción asistido, no como canal principal |
| **Excel como base de datos** | Archivos versionados a mano (`padron_final_v3_OK.xlsx`), sin control de cambios ni auditoría | Base relacional con historial y bitácora inmutable de cambios |
| **Sistemas contables cerrados** | El sistema administrativo-contable no expone API | Integración por exportación de archivo con formato acordado con Tesorería; la API queda como evolución, no como requisito |
| **Cero presupuesto para software** | No hay partida ni proceso de compra viable en el plazo útil | Se construye con recursos propios y software libre; costo de infraestructura marginal |
| **Rotación política** | Los sistemas mueren con la gestión que los creó | Datos abiertos, documentación y código en repositorio del municipio: el sistema debe sobrevivir a quien lo hizo |
| **Brecha digital y conectividad** | No todas las familias tienen datos, dispositivo o alfabetización digital | Diseño *mobile-first* y liviano, canal WhatsApp, y puntos de carga asistida en las sedes vecinales |
| **Superposición de áreas** | Educación, Desarrollo Humano y Juntas Vecinales tocan a la misma familia sin verse | Padrón compartido con permisos por rol — cada área ve lo que le corresponde |

> El último punto merece atención especial: es **la oportunidad de alianza más grande del
> proyecto** y a la vez su principal fuente de conflicto. Ver `interno/01-mapa-de-poder.md`.

---

## 4. Lo que hay que aceptar sobre la brecha digital

Un sistema que exige un teléfono moderno con datos para cobrar una beca destinada a
familias de bajos ingresos es un sistema que **produce error de exclusión por diseño**.
Este es el riesgo ético central del proyecto y se mitiga con tres reglas innegociables:

1. **Ningún trámite puede ser exclusivamente digital.** Siempre existe un canal asistido
   presencial, y usarlo no implica demora ni penalización.
2. **El sistema debe funcionar en el teléfono más barato y con la peor conexión.**
   Presupuesto de peso por pantalla, funcionamiento sin conexión con sincronización
   posterior, y nada que dependa de una aplicación instalable.
3. **La sede vecinal es punto de acceso digital.** El estudiante que no tiene datos hace
   su trámite en la junta de su barrio. Esto convierte a las juntas en infraestructura
   pública de acceso — y le da a la Dirección de Juntas Vecinales un rol protagónico.

---

## 5. Síntesis: el costo de no hacer nada

| Si nada cambia | Consecuencia a 24 meses |
|---|---|
| El monto sigue sin indexar | La ayuda real cae sostenidamente y el programa pierde sentido para el beneficiario |
| El tope sigue congelado | Error de exclusión creciente: el programa se vuelve elitista por accidente |
| La contraprestación sigue en papel | Una denuncia puntual tiene capacidad de destruir el programa entero |
| No hay medición de resultados | El programa entra a cada discusión presupuestaria sin argumentos |
| No hay seguimiento post-egreso | Esquel sigue financiando el desarrollo de otras ciudades sin saberlo |

El costo de no hacer nada no es cero. Es la degradación silenciosa de un programa que
ya tiene la intención correcta y le falta el instrumento.
