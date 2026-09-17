# ADR-004 · Actualización del monto y del tope por fórmula aprobada

**Estado:** propuesta — **requiere decisión política** · **Fecha:** septiembre 2026

## Contexto

El PAE fija un monto de ayuda y un tope de ingresos del grupo familiar, ambos en valores
nominales, al inicio del ciclo. En un contexto inflacionario esto produce dos efectos
automáticos que **nadie decidió**:

1. **Licuación de la ayuda.** El monto pierde poder de compra mes a mes.
2. **Error de exclusión creciente.** El tope congelado, contra salarios nominales que
   suben, expulsa familias que siguen siendo igual de vulnerables en términos reales.

El segundo efecto es el más grave y el menos visible: **el programa se vuelve más
restrictivo cada mes sin ningún acto administrativo que lo disponga.**

## Decisión propuesta

Establecer, por el instrumento normativo que corresponda, una **fórmula de actualización
automática** para el monto de la ayuda y para el tope de ingresos, con:

- **Índice de referencia** explícito y público (IPC nacional o regional patagónico,
  o variación del salario mínimo — la elección es política y debe fundarse).
- **Periodicidad** definida (cuatrimestral sugerida).
- **Techo presupuestario** explícito, con procedimiento pautado si la actualización lo
  supera.
- **Publicación automática** del valor vigente en el portal de transparencia.

El sistema aplica la fórmula, registra el índice usado en cada liquidación y expone el
**poder de compra real** como indicador de cabecera del tablero.

## Fundamento

- Convierte una decisión política recurrente y conflictiva en una **regla técnica que se
  aplica sola**. Nadie tiene que pelear el aumento cada cuatro meses.
- Elimina un recorte silencioso que hoy nadie eligió y nadie puede defender.
- Hace **previsible** la ayuda para la familia, que es parte del valor del programa.
- Protege al Ejecutivo: la actualización deja de ser una concesión negociable y pasa a
  ser el cumplimiento de una norma propia.

## Consecuencias

**Positivas:** el programa mantiene su alcance real; desaparece la discusión periódica;
hay un indicador público de honestidad del programa.

**Negativas:** compromete presupuesto futuro, lo que exige el techo explícito y su
procedimiento de excepción. Puede requerir intervención del Concejo Deliberante.

**Riesgo de no hacerlo:** el programa se degrada solo. Y en algún momento alguien va a
calcular públicamente cuánto perdió la beca en términos reales — mucho mejor que ese
número lo publique el municipio primero, junto con la solución.

## Pendiente antes de decidir

- [ ] Determinar si requiere ordenanza o alcanza una resolución (`docs/07` §9, pregunta 7)
- [ ] Calcular el impacto presupuestario de tres escenarios de índice
- [ ] Definir el índice de referencia y fundamentar la elección
- [ ] Calcular la serie histórica de licuación 2023-2026 — **es el gráfico de la Fase 0**

> Esta es **la decisión de política pública más importante de todo el proyecto**, y la
> única que no puede tomar el área técnica. El software la hace visible, medible y
> automática. Tomarla es del Intendente.
