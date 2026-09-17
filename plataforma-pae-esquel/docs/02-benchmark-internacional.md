# 02 · Benchmark internacional: qué hicieron los que ya resolvieron esto

> Criterio de selección: se incluyen casos donde hay **evidencia pública documentada**,
> no marketing institucional. Para cada uno se extrae una lección accionable en Esquel y
> —más importante— **qué salió mal**, que es la parte que no aparece en las presentaciones.

---

## Tabla comparativa

| Caso | País | Qué resuelve | Mecanismo central | Lección para Esquel |
|---|---|---|---|---|
| **X-Road / once-only** | 🇪🇪 Estonia | El Estado pide mil veces el mismo dato | Capa de interoperabilidad entre bases + registro de accesos visible al ciudadano | No construir un silo nuevo: construir conectores. Y **mostrarle al estudiante quién consultó sus datos** |
| **Bolsa Família + Sistema Presença** | 🇧🇷 Brasil | Condicionalidad educativa a escala masiva | Frecuencia escolar verificada periódicamente; incumplimiento escalonado, no binario | El incumplimiento es **señal de alerta social**, no causal de baja. Y **Cadastro Único**: un padrón, muchos programas |
| **Progresa / Oportunidades** | 🇲🇽 México | ¿Sirve realmente la transferencia condicionada? | Evaluación de impacto con diseño experimental **desde el diseño del programa** | Diseñar la evaluación **antes** de lanzar. Después ya es tarde |
| **Sistema de Alerta Temprana (SAT)** | 🇨🇱 Chile | Detectar deserción antes de que ocurra | Modelo predictivo sobre asistencia, repitencia, rendimiento, nivel socioeconómico y entorno | La lección más valiosa es su **fracaso parcial**: uso voluntario y sin protocolo → la alerta no cambia nada |
| **Familias en Acción** | 🇨🇴 Colombia | Verificar compromisos sin quebrar al Estado | Verificación periódica automatizada contra registros escolares | El costo de verificación define la viabilidad. Si verificar cuesta más que el beneficio, el diseño está mal |
| **Plan Ceibal / Jóvenes en Red** | 🇺🇾 Uruguay | Integración socioeducativa con datos | Plataforma nacional + trabajo territorial con equipos de proximidad | La tecnología no reemplaza al referente territorial: **lo potencia** |
| **Decidim** | 🇪🇸 Barcelona | Legitimidad de decisiones públicas | Participación digital auditable y código abierto | Legitimidad **por procedimiento**: las reglas se publican antes de aplicarse |
| **Ciudades Educadoras (AICE)** | 🇪🇸 Barcelona / red mundial | Articular la ciudad como sistema educativo | Carta de compromisos + red internacional de intercambio | Marco conceptual que **ya es la bandera declarada de la Dirección de Educación** |
| **GDS Service Standard** | 🇬🇧 Reino Unido | Cómo construir servicios públicos digitales que funcionen | Estándar de 14 puntos, "empezar por la necesidad del usuario" | El método de trabajo del proyecto, no solo su resultado |
| **SINTyS** | 🇦🇷 Argentina | Superposición de beneficios entre niveles de gobierno | Cruce de datos nación / provincias / municipios | Herramienta **disponible ya**, por convenio, sin desarrollo propio |

---

## Los cuatro casos que hay que estudiar en detalle

### 🇧🇷 Bolsa Família — la gestión de condicionalidades

El programa brasileño de transferencias condicionadas es la referencia mundial en
verificación educativa a escala. Dos piezas importan acá:

**El Cadastro Único.** Un registro único de familias en situación de vulnerabilidad que
alimenta a decenas de programas distintos. La familia se registra **una vez** y ese
registro sirve para todo. Es la traducción práctica del principio estonio de "una sola
vez", aplicada a política social.

**El manejo del incumplimiento.** La condicionalidad de asistencia escolar (del orden del
85% para los tramos de edad escolar obligatoria y algo menor para adolescentes) no se
verifica para castigar. Se verifica para **detectar**. El incumplimiento reiterado
dispara una secuencia gradual —advertencia, bloqueo, suspensión— y, en paralelo,
**activa el acompañamiento de asistencia social**, porque la lectura oficial es que una
familia que deja de mandar a los chicos a la escuela está atravesando una crisis, no
haciendo trampa.

> **Lección para Esquel, textual:** el estudiante que deja de cumplir horas o pierde
> regularidad **no es un problema de control, es un caso social que apareció**. El
> sistema debe abrir una intervención, no ejecutar una baja. Esta es la decisión de
> diseño número dos del proyecto y define el tono de todo el producto.

**Lo que salió mal:** la verificación a escala nacional tiene un costo administrativo
enorme y depende de la calidad del dato escolar que carga cada escuela. Cuando el dato
de origen es malo, la condicionalidad castiga al azar. **Implicancia:** en Esquel, la
regularidad debe venir de una fuente verificable e institucional, nunca de un dato
declarado sin respaldo.

### 🇨🇱 Chile — SAT: la alerta que no alcanza

El Sistema de Alerta Temprana del Ministerio de Educación identifica estudiantes en
riesgo de abandonar cruzando asistencia, repitencia, rendimiento, nivel socioeconómico y
entorno familiar y social. Se extendió a todos los establecimientos públicos del país, y
existe investigación académica comparando modelos de aprendizaje automático contra
regresión logística tradicional sobre la base pública del ministerio.

Es el caso más parecido a lo que necesita Esquel. Y su lección principal es su límite:

> **El uso del SAT es voluntario y no existe un incentivo real ni una campaña orientada
> a su implementación masiva.** El resultado previsible es que la alerta se genera, se
> muestra en un tablero, y nadie está obligado a hacer nada con ella.

**Un semáforo sin protocolo es decoración.** Es la falla más común y más cara de los
sistemas de alerta en el sector público: se invierte todo el esfuerzo en el modelo
predictivo y nada en el flujo de trabajo posterior.

> **Traducción a requisito de producto, no negociable:** toda alerta de Trocha nace con
> **responsable asignado, plazo de respuesta (SLA) y bitácora obligatoria de qué se
> hizo**. Una alerta sin registro de intervención escala automáticamente al nivel
> superior. El tablero no muestra "cuántas alertas hay": muestra **cuántas fueron
> atendidas dentro del plazo**. Ver `06-motor-riesgo-y-matching.md`.

El segundo aporte chileno es metodológico: la comparación documentada entre aprendizaje
automático y regresión logística muestra que la ganancia de los modelos complejos sobre
los simples es real pero **moderada**, y que se paga con pérdida de explicabilidad. Con
el volumen de datos de Esquel, esa ecuación se inclina claramente hacia lo simple y
auditable. Ver `adr/ADR-001`.

### 🇪🇪 Estonia — el principio de una sola vez y la transparencia de accesos

Dos ideas trasladables y baratas:

**1. Once-only.** Ninguna oficina pública puede volver a pedirte un dato que el Estado ya
tiene. En Esquel, esto significa: si el estudiante presentó el certificado de domicilio
en el ciclo anterior y sigue vigente, **no se lo pedís de nuevo**. Cada papel que no se
vuelve a pedir es tiempo de ventanilla que se libera y una barrera de acceso que cae.

**2. Registro de accesos visible para el titular del dato.** El ciudadano estonio puede
ver qué funcionario consultó su información y cuándo. Es una inversión de la lógica
habitual: **el control no es solo del Estado sobre el ciudadano, sino también del
ciudadano sobre el Estado.**

> Implementarlo en Trocha cuesta muy poco —es una tabla de auditoría y una pantalla— y
> tiene un rendimiento político desproporcionado: es la respuesta definitiva a la
> acusación de "sistema de vigilancia a los pobres". *"El sistema no solo registra lo
> que hace el estudiante: registra lo que hace el municipio con los datos del
> estudiante, y el estudiante lo puede ver."*

### 🇲🇽 México — Progresa: evaluar desde el día cero

Progresa/Oportunidades es probablemente el programa social más evaluado de la historia,
porque su diseño original incorporó la evaluación de impacto **antes** del lanzamiento,
con incorporación escalonada de localidades que permitió construir un grupo de
comparación válido.

> **Lección incómoda pero decisiva:** el momento de decidir cómo vas a probar que el
> programa funciona es **antes** de empezar, no cuando te lo piden. Después del
> lanzamiento, ya no hay grupo de comparación posible y cualquier evaluación es débil.

**Aplicación concreta y éticamente viable en Esquel:** en un programa con cupo limitado,
cuando la demanda supera la oferta **ya existe** una lista de espera. Si el orden de
admisión entre postulantes de puntaje equivalente se resuelve de manera transparente y
reproducible, esa lista se convierte en un grupo de comparación natural — sin negarle el
beneficio a nadie que le corresponda y sin experimento artificial. Es la evaluación de
impacto más barata que existe: **guardar bien los datos de los que quedaron afuera.**

---

## El estándar de método: GDS Service Standard

El estándar británico de servicios digitales es el marco de trabajo recomendado para el
proyecto. Sus puntos más relevantes acá:

1. **Empezar por la necesidad del usuario**, no por la necesidad del área.
2. **Resolver el problema completo**, de punta a punta, no solo la parte digital.
3. **Hacerlo simple de usar**, y probarlo con usuarios reales, incluyendo personas con
   baja alfabetización digital.
4. **Iterar y mejorar con frecuencia.**
5. **Usar código abierto y publicarlo.**
6. **Definir métricas de desempeño desde el inicio.**

El punto 2 es el que más se incumple en GovTech municipal: se digitaliza el formulario
de entrada y se deja el resto del circuito en papel, con lo cual el ciudadano hace el
trámite dos veces.

---

## Herramienta disponible sin desarrollo: SINTyS

En Argentina, el **Sistema de Identificación Nacional Tributario y Social** permite el
cruce de datos entre organismos de distintos niveles de gobierno para detectar
incompatibilidades y superposiciones de beneficios. Los municipios pueden acceder por
convenio.

> Esto es una **victoria rápida de alto impacto político**: no requiere escribir una
> línea de código y produce un número concreto y verificable para la Fase 0. Verificar
> si el municipio ya tiene convenio vigente es una de las siete preguntas de la primera
> reunión (ver `CONTEXTO-Y-SUPUESTOS.md`, supuesto S5).

---

## Síntesis: las seis lecciones que se incorporan al diseño

| # | Lección | Origen | Dónde se implementa |
|---|---|---|---|
| 1 | Un padrón, muchos programas | Cadastro Único 🇧🇷 | `05-modelo-de-datos.md` |
| 2 | El incumplimiento abre acompañamiento, no baja | Bolsa Família 🇧🇷 | `06` — máquina de estados |
| 3 | Alerta sin protocolo y SLA es decoración | SAT 🇨🇱 | `06` — flujo de intervención |
| 4 | No volver a pedir un dato que ya tenés | Estonia 🇪🇪 | `04` — módulo M1 |
| 5 | El titular del dato ve quién lo consultó | Estonia 🇪🇪 | `07-gobernanza-datos-y-legal.md` |
| 6 | Guardar los datos de los que quedaron afuera | Progresa 🇲🇽 | `03-kpis-y-sroi.md` — contrafactual |

---

## Fuentes

- MINEDUC Chile — *Sistema de Alerta Temprana contra la deserción escolar*:
  <https://www.mineduc.cl/sistema-de-alerta-temprana-contra-la-desercion-escolar/>
- MINEDUC Chile — *Guía de usuario SAT*:
  <https://cadadiacuenta.mineduc.cl/assets/pdf/Guia%20de%20usuario%20SAT.pdf>
- Liceos Bicentenario — *SAT: herramientas para promover la retención escolar*:
  <https://liceosbicentenario.mineduc.cl/wp-content/uploads/sites/120/2021/04/Presentacion-SAT.pdf>
- Ministerio de Desarrollo Social y Familia, Chile — lanzamiento conjunto del SAT:
  <https://www.desarrollosocialyfamilia.gob.cl/noticias/ministerios-de-educacion-y-desarrollo-social-lanzan-sistema-de-alerta-temprana-contra-la-desercion-e>
- 24horas — ampliación del SAT a todos los establecimientos públicos:
  <https://www.24horas.cl/nacional/mineduc-decide-ampliar-sistema-de-alerta-temprana-contra-la-desercion-escolar-a-todos-los-establecimientos-publicos-4218978>
- SciELO Chile — *An application of machine learning in public policy: early warning
  prediction of school dropout in the Chilean public education system*:
  <https://www.scielo.cl/scielo.php?pid=S0718-39922022000100020&script=sci_abstract>

> Las fuentes sobre Esquel (PAE, gabinete municipal, juntas vecinales) están consolidadas
> en `CONTEXTO-Y-SUPUESTOS.md`.
