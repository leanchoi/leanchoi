# 00 · Resumen ejecutivo

**Para:** Intendencia y Dirección de Educación, Municipalidad de Esquel
**Asunto:** Plataforma Trocha — gestión, trazabilidad e impacto del PAE
**Fecha:** septiembre de 2026

---

## La frase

> El PAE sabe cuánto gasta. No sabe qué logra. Esa diferencia se puede cerrar en
> **cinco meses y sin presupuesto nuevo**, y el resultado es un programa que se
> puede defender con números en cualquier sesión del Concejo.

---

## El diagnóstico, en cuatro líneas

1. **El programa mide insumos, no resultados.** "80 beneficiarios, $X ejecutados" es
   una rendición contable, no una política pública evaluada. Nadie puede afirmar hoy si
   el PAE mejora la terminalidad educativa, porque nunca se midió.
2. **La inflación está tomando decisiones que nadie tomó.** Un monto nominal fijo se
   licúa durante el ciclo, y un tope de ingresos sin indexar vuelve al programa **más
   restrictivo cada mes sin que ninguna autoridad lo haya decidido**. Es un recorte por
   omisión: el peor tipo, porque no se ve y no se puede defender.
3. **La contraprestación comunitaria no es auditable.** Si se registra en papel y la
   firma un referente, el municipio no puede probar que ocurrió — ni ante el Concejo,
   ni ante un vecino, ni ante la prensa. El riesgo reputacional es asimétrico: una sola
   denuncia sin poder de respuesta destruye el programa entero.
4. **Se financia formación cuyo retorno se lo lleva otra ciudad.** Sin seguimiento
   post-egreso ni puente con la demanda laboral local, Esquel subsidia el capital humano
   que después se radica en Comodoro, Bariloche o Buenos Aires.

## El cuarto punto es el más importante y casi nadie lo mira

Para una ciudad de cordillera, la métrica que realmente importa no es cuántos se reciben:
es **cuántos se quedan**. Trocha introduce la **tasa de arraigo** —proporción de egresados
del PAE que a los 24 y 36 meses siguen viviendo y trabajando en Esquel— como indicador
de cabecera. Es un número que hoy ningún municipio de la región puede reportar, y es
exactamente el número que convierte un gasto social en una inversión de desarrollo local.

---

## Qué se construye

Una plataforma municipal única, con tres caras sobre un mismo padrón:

| Cara | Para quién | Qué hace |
|---|---|---|
| **Panel de conducción** | Intendente y Directora | Presupuesto, ejecución, poder de compra real, embudo del ciclo, mapa de riesgo por barrio, cumplimiento de compromiso comunitario |
| **Portal del estudiante** | Becarios y familias | Inscripción sin papel, estado del trámite, constancia de regularidad, registro de horas con evidencia, credencial verificable de experiencia |
| **Mesa de territorio** | Equipo técnico y juntas vecinales | Alertas tempranas con protocolo y plazo, validación de actividades, cruce de datos, gestión de sedes |

Detalle completo en `04-arquitectura-producto.md`.

---

## Las cinco decisiones de diseño que definen el proyecto

| # | Decisión | Por qué importa |
|---|---|---|
| 1 | **Reglas explicables antes que inteligencia artificial** | Con ~80-500 becarios no hay volumen para entrenar un modelo confiable, y una decisión que afecta un derecho tiene que poder explicarse a una familia en una oración. El motor de riesgo arranca con reglas auditables; el aprendizaje automático entra cuando haya tres ciclos de datos propios. Ver `adr/ADR-001` |
| 2 | **El incumplimiento dispara acompañamiento, no baja automática** | Es la lección central de Bolsa Família: la condicionalidad sirve como **detector social**, no como castigo. Un chico que falta es la señal, no el culpable |
| 3 | **La contraprestación se convierte en credencial** | Las horas comunitarias emiten un certificado verificable de experiencia. La obligación pasa a ser un activo en el CV del estudiante — y ese reencuadre desarma la crítica de "trabajo forzado a cambio de una beca" |
| 4 | **Sin ranking público de pobres** | La gamificación mide constancia personal y logro colectivo por sede. Nunca una tabla de posiciones individual entre becarios. Ver `adr/ADR-003` |
| 5 | **El monto se indexa por regla, no por gestión** | Se define una fórmula de actualización del monto y del tope de ingresos aprobada una vez, que se aplica sola. Saca la licuación de la agenda política. Ver `adr/ADR-004` |

---

## El reloj manda

**La convocatoria del PAE abre en febrero.** Esa fecha no se negocia y define todo el plan:

```
SEP-OCT 2026   Fase 0 · Diagnóstico de datos      → el primer número duro
NOV 2026       Fase 1 · Piloto nivel superior     → 2 barrios, padrón real
DIC-ENE 2027   Fase 2 · Capacitación vecinal      → juntas y equipo
FEB 2027       Fase 3 · Convocatoria 100% digital → el lanzamiento
AGO 2027       Fase 4 · Rendición pública         → la cosecha política
```

Si la plataforma no está lista para febrero, se pierde un ciclo entero: doce meses.
Ver `08-plan-implementacion.md`.

---

## Lo que se pide para empezar

**Nada de presupuesto.** Fase 0 requiere tres cosas y ninguna cuesta dinero:

1. Acceso de lectura al padrón del ciclo vigente.
2. Una reunión de una hora con el Área de Extensión Educativa.
3. Autorización para presentar un diagnóstico de calidad de datos en 45 días.

El diagnóstico de Fase 0 produce el primer entregable medible: **cuántos registros del
padrón tienen inconsistencias, duplicaciones o incompatibilidades detectables.** Ese
número, solo, justifica todo lo que viene después.

---

## Qué gana cada quien

| Actor | Lo que se lleva |
|---|---|
| **Intendente** | Un programa social auditable y defendible, con costo por resultado calculado. Eficiencia sin el costo político de recortar |
| **Directora de Educación** | Deja de administrar planillas y pasa a conducir trayectorias. Instrumento concreto para su bandera de *ciudad educadora* |
| **Dirección de Juntas Vecinales** | Registro vivo de sedes y actividad barrial: por primera vez puede mostrar lo que el territorio produce, no solo pedir |
| **Estudiantes y familias** | Trámite sin ventanilla, pago previsible, acompañamiento real y una credencial que sirve para conseguir trabajo |
| **Vecinos** | Portal público con datos abiertos: cada peso y cada hora, verificables |

---

## Riesgo principal y su mitigación

El riesgo no es técnico. Es que **la ciudadanía lea "sistema de control" donde dice
"sistema de acompañamiento"**, y que la oposición lo instale como recorte encubierto.

Esquel tiene una cultura cívica que castiga con dureza las decisiones tomadas de arriba
hacia abajo y sin consulta. La mitigación es de procedimiento, no de comunicación:
**las reglas se publican antes de aplicarse, se co-diseñan con las juntas vecinales, y
el primer informe público sale con nombre y apellido de los resultados, no de los
beneficiarios.** Ver `09-comunicacion-publica.md`.

---

## Una advertencia honesta

Este proyecto no se sostiene solo con software. Se sostiene con un padrino político que
lo banque cuando alguien se sienta invadido —y alguien se va a sentir invadido—. La
tecnología es la parte fácil y ya está resuelta en este repositorio. La parte difícil
está en `interno/`.
