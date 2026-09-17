# 04 · Arquitectura de producto: el CRM del PAE

## 1. Principio rector

> **Una persona, un legajo, muchas miradas.**

No hay tres sistemas. Hay **un padrón** y tres interfaces que muestran distintas caras
según quién mira. La Directora ve la trayectoria pedagógica, la Tesorería ve la orden de
pago, el referente vecinal ve solo la actividad de su sede, y el estudiante ve su propio
legajo completo — incluido el registro de quién lo consultó.

---

## 2. Mapa de módulos

```
┌──────────────────────────────────────────────────────────────────────┐
│                       PORTAL PÚBLICO (sin login)                     │
│   M8 · Transparencia: datos abiertos, reglas, ejecución agregada     │
└──────────────────────────────────────────────────────────────────────┘
        ▲
┌───────┴──────────────┬───────────────────────┬───────────────────────┐
│  M7 · ESTUDIANTE     │  M6 · CONDUCCIÓN      │  M4 · TERRITORIO      │
│  Portal ciudadano    │  Panel analítico      │  Mesa de trabajo      │
│  (móvil primero)     │  (Intendente/Dir.)    │  (equipo + juntas)    │
└───────┬──────────────┴───────────┬───────────┴───────────┬───────────┘
        │                          │                       │
┌───────▼──────────────────────────▼───────────────────────▼───────────┐
│                          NÚCLEO DE DOMINIO                            │
│                                                                       │
│  M1 Padrón y ciclo de vida   │  M2 Trayectoria educativa              │
│  M3 Compromiso comunitario   │  M5 Pagos y presupuesto                │
│  M9 Puente Esquel (matching) │  M10 Identidad, roles y auditoría      │
└───────────────────────────────────────────────────────────────────────┘
        │
┌───────▼───────────────────────────────────────────────────────────────┐
│  INTEROPERABILIDAD · SINTyS · RENAPER · Provincia (regularidad)       │
│                     · Tesorería municipal · WhatsApp                  │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 3. Módulos del núcleo

### M1 · Padrón y ciclo de vida del beneficiario

El corazón del sistema. Modela la vida de una postulación como **máquina de estados
explícita**, no como un campo "estado" que alguien edita a mano.

```
BORRADOR → PRESENTADA → EN_EVALUACIÓN → ADMITIDA ──→ ACTIVA ⇄ EN_RIESGO
                              │             │           │        │
                              ▼             ▼           │        ▼
                        OBSERVADA      LISTA_ESPERA     │   EN_ACOMPAÑAMIENTO
                              │                         │        │
                              ▼                         ▼        ▼
                          RECHAZADA              EGRESADA    SUSPENDIDA → BAJA
```

Reglas duras:
- **Toda transición queda registrada** con actor, fecha, motivo y fundamento normativo.
- **Ninguna transición a `SUSPENDIDA` o `BAJA` puede ser automática.** El sistema
  propone; una persona decide y firma. (Ver `adr/ADR-001` y `07-gobernanza-datos-y-legal.md`.)
- **`LISTA_ESPERA` se conserva con todos sus datos** — es el grupo de comparación del
  SROI. Ver `03-kpis-y-sroi.md` §4.5.

Funciones:
- Inscripción digital con guardado parcial (se puede completar en varias sesiones desde
  el celular, sin perder lo cargado).
- **Motor de elegibilidad** que evalúa criterios y **explica el resultado en texto
  legible**: *"No cumple residencia mínima: 2 años 4 meses acreditados sobre 3
  requeridos"*. Nunca un rechazo sin causa expresada.
- **Bóveda documental *once-only*:** el documento cargado queda vinculado a la persona
  con su vigencia. Si sigue vigente el ciclo siguiente, el sistema no lo vuelve a pedir
  y lo indica en pantalla: *"Ya tenemos tu certificado de domicilio, vence en 08/2027"*.
- Detección de duplicados por documento y por similitud de datos de contacto.
- Renovación asistida: el ciclo siguiente arranca precargado.

### M2 · Trayectoria educativa

- Registro de institución, nivel, carrera/año, y condición.
- Carga de constancia de regularidad con **fecha de vencimiento**, que dispara
  recordatorio automático 15 días antes.
- Historial académico por período, con materias aprobadas/adeudadas para nivel superior.
- **Verificación de origen:** el sistema distingue el dato *declarado* del dato
  *verificado*, y esa distinción es visible en toda la interfaz. Un dato declarado nunca
  dispara una consecuencia negativa por sí solo.
- Línea de tiempo de la trayectoria: la vista que convierte un expediente en una historia.

### M3 · Compromiso comunitario

> Nombre deliberado. Ver `09-comunicacion-publica.md`: *contraprestación* describe una
> deuda; *compromiso comunitario* describe una pertenencia. Es el mismo requisito con
> otro contrato psicológico.

Piezas:

| Pieza | Función |
|---|---|
| **Catálogo de proyectos** | Las sedes vecinales y las áreas municipales publican necesidades con cupo, horario, perfil buscado y referente responsable |
| **Postulación y asignación** | El estudiante elige; el referente confirma. Con sugerencia del motor de matching (M9) |
| **Check-in / check-out** | QR en la sede + geocerca + sello de tiempo. Funciona sin conexión y sincroniza después |
| **Evidencia** | Foto o nota breve de la actividad, con validación del referente |
| **Validación** | El referente confirma; el equipo audita por muestreo |
| **Contador de horas** | Progreso hacia el compromiso del ciclo, visible en tiempo real |
| **Credencial verificable** | Al cerrar el ciclo se emite un certificado con código de verificación pública |

**La credencial es la pieza estratégica.** Convierte una obligación en un activo:
el estudiante termina el ciclo con un certificado municipal verificable de experiencia
en trabajo comunitario, con horas, tareas y referente — algo que puede poner en un CV.

> Ese reencuadre es lo que desarma de raíz la crítica más peligrosa que puede recibir el
> programa: *"les hacen trabajar gratis a cambio de la beca"*. La respuesta deja de ser
> defensiva y pasa a ser: *"se llevan una certificación de experiencia laboral que antes
> no existía"*.

### M4 · Alertas y acompañamiento

El módulo que implementa la lección chilena (ver `docs/02`): **ninguna alerta existe sin
protocolo**.

```
  SEÑAL detectada                    → 2. Se ASIGNA a un responsable
  (regularidad vencida,                   automáticamente, con SLA según
   horas atrasadas,                       severidad
   inasistencia, no
   respuesta a contacto)            → 3. El responsable REGISTRA la
                                         intervención en bitácora
                                         (obligatorio, no salteable)
                                    
                                    → 4. Se cierra con RESULTADO
                                         o ESCALA al nivel superior
                                         si vence el SLA
```

| Severidad | SLA | Escalamiento |
|---|---|---|
| Informativa | 10 días hábiles | — |
| Media | 5 días hábiles | Coordinación del área |
| Alta | 48 horas | Dirección de Educación |
| Crítica (riesgo de abandono inminente) | 24 horas | Dirección + articulación con Desarrollo Humano |

**El indicador que se muestra en el tablero no es "cuántas alertas hay" sino "qué
porcentaje se atendió en plazo".** Un tablero que cuenta alertas mide el problema; un
tablero que cuenta respuestas mide la gestión.

### M5 · Pagos y presupuesto

- Generación del padrón de pago del período con validaciones previas (regularidad
  vigente, estado activo, datos bancarios válidos).
- **Exportación en el formato que Tesorería ya usa.** No se le pide a Tesorería que
  cambie su sistema: el sistema se adapta al de ellos. Es la diferencia entre un
  proyecto que avanza y uno que se traba seis meses.
- Conciliación de acreditaciones y registro de rechazos bancarios.
- Seguimiento de ejecución contra partida, con proyección de cierre.
- **Motor de actualización del monto** según la fórmula aprobada (`adr/ADR-004`).

### M9 · Puente Esquel — matching formación ↔ demanda local

Conecta el perfil del estudiante de nivel superior con las necesidades productivas
relevadas por las áreas de Producción y Trabajo, y con las sedes vecinales.

- Taxonomía de competencias sencilla y mantenible (no una ontología académica).
- Registro de demanda: qué perfiles buscan las áreas municipales, las cámaras y las
  instituciones locales.
- Puntaje de afinidad transparente, con los factores a la vista.
- **Uso doble:** sugerir proyectos de compromiso comunitario alineados con lo que el
  estudiante estudia (un estudiante de enfermería en el centro de salud barrial, uno de
  informática dando alfabetización digital en la sede) y, al egresar, conectar con
  oportunidades locales.

> Que el compromiso comunitario se alinee con la carrera transforma completamente el
> costo percibido: deja de ser tiempo restado al estudio y pasa a ser **práctica
> profesional**. Sube el cumplimiento, sube la calidad del servicio prestado y sube el
> arraigo. Es, en una sola decisión de diseño, el mayor retorno del proyecto.

### M10 · Identidad, roles y auditoría

| Rol | Alcance |
|---|---|
| Estudiante | Su propio legajo + registro de accesos a sus datos |
| Referente de sede vecinal | Solo la actividad de su sede; **sin acceso a datos socioeconómicos** |
| Operador del área | Legajos del programa, sin acceso a pagos |
| Directora de Educación | Todo el programa + tablero |
| Tesorería | Padrón de pago, sin datos sensibles |
| Intendencia | Tablero agregado; acceso a legajos individuales solo con justificación registrada |
| Auditoría | Solo lectura, alcance total, sin capacidad de modificación |

- **Bitácora inmutable**: quién vio qué, cuándo y desde dónde. Solo se agrega, nunca se
  edita ni se borra.
- Doble factor obligatorio para roles con acceso a datos sensibles.
- **El estudiante ve su propio registro de accesos** (principio estonio, ver `docs/02`).

---

## 4. Las tres interfaces

### 4.1 M6 · Panel de conducción (Intendente y Directora)

**Regla de diseño:** una pantalla, sin desplazamiento en un monitor estándar, **una sola
cifra protagonista**. Un tablero con veinte gráficos no se lee: se ignora.

El panel tiene dos modos con el mismo dato debajo:

| Modo Intendente | Modo Directora |
|---|---|
| Plata, resultado y riesgo político | Casos, cohortes y carga de trabajo |
| Horizonte: el ciclo y el mandato | Horizonte: la semana y el cuatrimestre |
| Pregunta: *¿se defiende?* | Pregunta: *¿a quién atiendo hoy?* |

#### Componentes del modo Intendente

| # | Componente | Forma | Por qué esa forma |
|---|---|---|---|
| 1 | **Tasa de permanencia del ciclo** | Cifra protagonista + variación vs ciclo anterior | Es el titular. Una sola cifra grande, nada compite con ella |
| 2 | Ejecución presupuestaria | Línea de dos series (devengado / presupuestado) con proyección punteada al cierre | Magnitud en el tiempo con comparación contra un plan |
| 3 | **Poder de compra real del monto** | Línea indexada, base 100 = mes de resolución, con banda de referencia | Índice, no pesos: el punto es la *pérdida relativa*, y el índice la hace visible |
| 4 | Embudo del ciclo | Barras horizontales ordenadas por etapa con caída entre etapas | Un embudo es una secuencia con pérdida; las barras horizontales dejan lugar a etiquetas largas |
| 5 | Riesgo por barrio | Cartograma esquemático de barrios con rampa secuencial de un solo tono | Magnitud sobre geografía. **Un tono, claro→oscuro.** Nunca arcoíris |
| 6 | Cumplimiento de compromiso comunitario | Medidor + barras por sede | El medidor da el total; las barras dan el detalle accionable |
| 7 | Alertas fuera de plazo | Tabla compacta, máximo 5 filas | Es una lista de trabajo, no un gráfico |

#### Reglas de visualización (aplican a todo el sistema)

Derivadas del sistema de diseño (`design/sistema-visual.md`), y son de cumplimiento
obligatorio para quien implemente:

- **Nunca dos ejes verticales en un mismo gráfico.** Dos magnitudes de escala distinta
  son dos gráficos, o se indexan a una base común.
- **Secuencial = un solo tono, claro a oscuro. Divergente = dos tonos con gris al
  medio.** Jamás una escala arcoíris para representar magnitud.
- **El color identifica a la entidad, nunca a su posición en el ranking.** Si se filtra
  y cambian las series visibles, las que quedan conservan su color.
- **Los colores de estado (bien / atención / grave / crítico) están reservados** y
  siempre van acompañados de ícono y texto. El color nunca comunica solo.
- Las etiquetas y los números usan colores de texto, **nunca el color de la serie**.
- Etiquetado selectivo: el extremo, el último punto, el dato del que habla el título.
  Nunca un número sobre cada punto.
- Toda vista gráfica tiene su **vista de tabla** equivalente, a un clic.

### 4.2 M7 · Portal del estudiante

**Móvil primero, y en serio:** el estudiante entra desde un teléfono, muchas veces con
conexión mala y datos contados.

Pantallas:

1. **Mi beca** — estado actual, próximo pago con fecha, monto, y qué falta para cobrarlo.
   Sin ambigüedad y sin jerga administrativa.
2. **Mis trámites** — qué presenté, qué falta, qué vence y cuándo. Con estado legible:
   *"Tu constancia vence el 30/09. Cargala antes para no interrumpir el pago."*
3. **Mi compromiso** — progreso de horas, próxima actividad agendada, botón de check-in.
4. **Buscar actividad** — catálogo filtrable por barrio, día, horario y afinidad con la
   carrera.
5. **Mi credencial** — certificado de experiencia con código de verificación.
6. **Mis datos** — qué sabe el municipio sobre mí y **quién lo consultó**.

#### Sobre la gamificación — con cuidado

La gamificación en un programa social es un instrumento con filo. Mal aplicada convierte
la vulnerabilidad en competencia y humilla. Las reglas del proyecto:

| ✅ Sí | ❌ Nunca |
|---|---|
| Progreso personal contra la **propia** meta | Ranking público de estudiantes |
| Rachas de constancia | Comparación visible entre personas |
| Logros por competencia adquirida, verificables | Insignias infantilizantes |
| Metas **colectivas por sede o barrio** | Cualquier exposición del dato socioeconómico |
| Reconocimiento del referente vecinal | Notificaciones que induzcan culpa |

> El objetivo es **constancia y pertenencia**, no competencia. Si un elemento de juego
> puede hacer que alguien se sienta expuesto por ser pobre, no entra. Ver `adr/ADR-003`.

### 4.3 M4 · Mesa de territorio (equipo técnico y juntas vecinales)

La herramienta de trabajo diario. Su métrica de éxito es **tiempo hasta la acción**.

- **Bandeja de alertas priorizada** por severidad y plazo restante, no por fecha de
  creación.
- **Ficha de 360°**: toda la trayectoria de una persona en una pantalla, con su línea de
  tiempo.
- **Cola de validación** de horas y evidencias, diseñada para resolver en lote y rápido.
- **Panel de sede** para el referente vecinal: solo su barrio, solo su actividad.
- **Registro de intervenciones** con plantillas para los casos frecuentes — el equipo no
  debería tener que escribir de cero lo mismo cien veces.
- **Vista de cruces**: resultados de la verificación contra bases externas, con
  semáforo y **siempre con revisión humana obligatoria antes de cualquier consecuencia**.

---

## 5. Innovación tecnológica: qué se incorpora y qué no

| Idea | Veredicto | Fundamento |
|---|---|---|
| **Motor de riesgo por reglas explicables** | ✅ Fase 1 | Auditable, explicable a una familia, funciona con pocos datos. `adr/ADR-001` |
| **Aprendizaje automático predictivo** | 🕐 Fase 4, no antes | Requiere 3 ciclos de datos propios. Antes es humo con riesgo legal |
| **QR + geocerca + evidencia con sello de tiempo** | ✅ Fase 1 | Resuelve el problema más urgente y visible |
| **Funcionamiento sin conexión** | ✅ Fase 1 | Condición de realidad en sedes barriales |
| **Credencial verificable de experiencia** | ✅ Fase 2 | El mayor retorno simbólico por unidad de esfuerzo técnico |
| **Matching con demanda local** | ✅ Fase 2 | El diferencial estratégico del programa |
| **Bot de WhatsApp para avisos y carga** | ✅ Fase 2 | Es el canal que la gente realmente usa |
| **Registro de accesos visible al titular** | ✅ Fase 1 | Costo bajo, retorno político desproporcionado |
| **Datos abiertos anonimizados** | ✅ Fase 3 | Blindaje anticipado contra la acusación de opacidad |
| **Blockchain para certificados** | ❌ | Un código de verificación contra una base municipal resuelve lo mismo. Agregar cadena de bloques sería complejidad sin beneficio, y suena a novedad vacía frente a un Concejo |
| **Reconocimiento facial para asistencia** | ❌ | Desproporcionado sobre menores y población vulnerable. Riesgo legal y reputacional altísimo por un beneficio marginal sobre el QR |
| **Puntaje social del beneficiario** | ❌ | Un puntaje que condicione derechos sin decisión humana fundada es inadmisible. `07-gobernanza-datos-y-legal.md` |

> **Las tres exclusiones son tan importantes como las inclusiones.** Saber decir que no a
> la tecnología de moda es lo que distingue a un criterio técnico de un entusiasmo — y
> es exactamente lo que hay que mostrar en una mesa donde alguien va a preguntar "¿y esto
> no se puede hacer con inteligencia artificial?".

---

## 6. Stack técnico propuesto

| Capa | Elección | Por qué |
|---|---|---|
| Aplicación | Next.js (App Router) + TypeScript | Un solo repositorio, una sola persona puede mantenerlo, renderizado en servidor para que ande en teléfonos lentos |
| Datos | PostgreSQL + Prisma | Relacional, maduro, gratuito, con extensiones geoespaciales disponibles |
| Autenticación | Sesión propia + TOTP para roles sensibles | Sin dependencia de proveedores externos |
| Estilos | Tailwind con tokens propios del sistema visual | Velocidad sin heredar una estética genérica |
| Gráficos | SVG propio, sin biblioteca de charts | Control total del sistema visual. Las bibliotecas traen su propia estética y su propio arcoíris |
| Archivos | Disco local + respaldo externo cifrado | Simple, barato, suficiente |
| Despliegue | Docker Compose + Caddy en VPS | Reproducible, TLS automático, una sola máquina |
| Observabilidad | Logs estructurados + healthcheck + respaldo verificado | Lo mínimo serio |

**Decisión transversal:** monolito modular, no microservicios. Ver `adr/ADR-002`.
Un equipo de una persona con microservicios es una persona con más problemas.
