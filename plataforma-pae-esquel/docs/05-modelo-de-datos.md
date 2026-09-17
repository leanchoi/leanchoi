# 05 · Modelo de datos

El esquema ejecutable está en `schema/schema.prisma`. Este documento explica **las
decisiones** detrás de él, que es lo que no se puede leer en el código.

---

## 1. Las seis decisiones estructurales

### D1 · La persona y la postulación son entidades distintas

`Persona` existe una vez y para siempre. `Postulacion` existe una por persona y por
ciclo. Parece obvio y casi ningún sistema municipal lo hace: lo habitual es una planilla
por año donde la misma persona aparece cinco veces sin saber que es la misma.

Separarlas es lo que habilita:
- la trayectoria plurianual (*"esta chica viene desde 2023"*),
- la reutilización documental *once-only*,
- la detección de duplicados,
- y el análisis de cohortes, sin el cual no hay evaluación posible.

### D2 · Un padrón, muchos programas

`Persona` y `GrupoFamiliar` no pertenecen al PAE: pertenecen al municipio. El PAE es
**un programa más** que se apoya en ellos.

Es el principio del Cadastro Único brasileño (ver `docs/02`), y tiene una consecuencia
política importante: el día que Desarrollo Humano quiera sumar su programa, la
infraestructura ya está y **la tienen que pedir**. El proyecto deja de ser "el sistema de
Educación" y pasa a ser infraestructura municipal.

> Esto hay que construirlo desde el primer día aunque al principio haya un solo programa.
> Migrar después cuesta diez veces más.

### D3 · Dato declarado ≠ dato verificado

Todo dato sensible para una decisión lleva tres campos: el valor, su **origen**
(`DECLARADO`, `DOCUMENTO`, `CRUCE_EXTERNO`, `VERIFICADO_AGENTE`) y su fecha de
verificación.

Regla dura: **un dato `DECLARADO` nunca dispara por sí solo una consecuencia negativa.**
Puede generar una alerta para que alguien verifique; no puede generar una baja.

### D4 · La bitácora solo crece

`EventoAuditoria` es *append-only*: no se actualiza ni se borra, ni siquiera por un
administrador. Cada cambio de estado, cada consulta a datos sensibles, cada exportación
queda registrada con actor, momento, origen y motivo.

Es la diferencia entre un sistema que se puede auditar y uno en el que hay que confiar.
En una discusión pública sobre un caso puntual, la bitácora **es** la defensa
institucional.

### D5 · La evidencia se guarda separada del dato personal

Fotos y archivos de evidencia viven en un almacén aparte, referenciados por
identificador opaco, con política de retención propia y borrado programado. La geometría
de geocerca se guarda como dato del proyecto, y del check-in **solo se conserva si cayó
dentro o fuera, con qué precisión, no la traza de ubicación del estudiante**.

> Nunca se almacena un historial de ubicación de una persona. Se almacena una validación
> booleana de un momento puntual que la persona inició voluntariamente. La diferencia es
> jurídica y es ética, y hay que poder explicarla. Ver `adr/ADR-003`.

### D6 · Los montos se guardan en enteros, con moneda e índice

Nunca punto flotante para dinero. Y cada monto histórico guarda el **valor del índice de
actualización vigente al momento**, para poder reconstruir el poder de compra real sin
tener que recalcular nada después. Es lo que hace posible el indicador estrella del
tablero.

---

## 2. Entidades principales

| Entidad | Qué representa | Notas |
|---|---|---|
| `Persona` | Un ser humano, una vez | Identificada por tipo+número de documento |
| `GrupoFamiliar` | Hogar | Ingresos, composición, domicilio |
| `Domicilio` | Dirección con barrio y junta vecinal | Vincula el padrón al territorio |
| `Ciclo` | Año de programa | Monto base, tope de ingresos, fórmula de actualización, cupos |
| `Postulacion` | Una persona en un ciclo | Máquina de estados (`docs/04` §M1) |
| `TrayectoriaEducativa` | Institución, nivel, carrera, condición | Con historial |
| `Regularidad` | Constancia con vigencia | Dispara recordatorios |
| `Documento` | Archivo con tipo y vencimiento | Base del *once-only* |
| `ProyectoComunitario` | Necesidad publicada por una sede o área | Cupo, horario, perfil, geocerca |
| `Asignacion` | Estudiante ↔ proyecto | Con referente responsable |
| `RegistroHoras` | Un check-in/check-out validado | Evidencia + validación + resultado de geocerca |
| `Credencial` | Certificado de experiencia emitido | Con código de verificación pública |
| `Alerta` | Señal de riesgo | Severidad, SLA, responsable, estado |
| `Intervencion` | Qué se hizo con una alerta | Obligatoria para cerrarla |
| `Liquidacion` / `ItemPago` | Padrón de pago del período | Exportable a Tesorería |
| `Sede` | Sede vecinal o municipal | Vinculada a junta vecinal |
| `EventoAuditoria` | Bitácora inmutable | Solo inserción |
| `AccesoDato` | Quién consultó datos de quién | **Visible para el titular** |

---

## 3. El cruce con el territorio

`Domicilio → Barrio → JuntaVecinal` es lo que permite el mapa de riesgo y la
distribución territorial de las horas.

**Advertencia de calidad de dato:** el domicilio declarado en un formulario municipal es
notoriamente inconsistente (abreviaturas, errores de tipeo, barrios con más de un
nombre). El sistema normaliza contra un **catálogo maestro de barrios y juntas
vecinales** cargado una sola vez.

> Ese catálogo hay que pedírselo a la Dirección de Juntas Vecinales. Es, además, una
> excusa perfecta para la primera reunión con Gastón: no le pedís que apruebe nada, le
> pedís su catálogo y le ofrecés devolvérselo convertido en información.
> Ver `interno/04-alianza-gaston.md`.

---

## 4. Retención y minimización

| Dato | Retención | Fundamento |
|---|---|---|
| Legajo del beneficiario | Ciclo + 5 años | Plazo de auditoría y reconstrucción de trayectoria |
| Fotos de evidencia | 24 meses | Cumplen su función de auditoría y después son riesgo puro |
| Datos de geocerca | Solo el booleano y la precisión, indefinido | No es traza de ubicación |
| Datos de lista de espera | Ciclo + 5 años | Grupo de comparación del SROI |
| Bitácora de auditoría | 10 años | Plazo de responsabilidad administrativa |
| Datos de salud o discapacidad | **Solo si son estrictamente necesarios**, con base legal expresa y cifrado adicional | Categoría especial |

**Principio de minimización, aplicado en serio:** antes de agregar un campo al
formulario, hay que poder contestar *"¿qué decisión cambia este dato?"*. Si la respuesta
es "ninguna, pero por las dudas", el campo no va. Cada campo de más es riesgo legal,
fricción para el ciudadano y una barrera de acceso adicional.
