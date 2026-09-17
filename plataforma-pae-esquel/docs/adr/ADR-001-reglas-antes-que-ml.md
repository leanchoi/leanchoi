# ADR-001 · Motor de riesgo por reglas explicables antes que aprendizaje automático

**Estado:** aceptada · **Fecha:** septiembre 2026

## Contexto

El sistema debe detectar estudiantes en riesgo de abandonar. Existe la opción de entrenar
un modelo predictivo, siguiendo el ejemplo del Sistema de Alerta Temprana chileno, y la
opción de implementar un motor de reglas con pesos explícitos.

La población del programa es del orden de 80 a 500 becarios por ciclo. La decisión afecta
el acceso a un beneficio público.

## Decisión

**Se implementa un motor de reglas explícitas, con pesos configurables y puntaje siempre
descompuesto.** El aprendizaje automático queda diferido a Fase 4, condicionado a
disponer de tres ciclos completos de datos propios y a superar a las reglas en una
comparación documentada.

## Fundamento

1. **Volumen insuficiente.** Con esta escala, un modelo aprende ruido antes que señal.
2. **Explicabilidad como requisito, no como preferencia.** Ante un reclamo, hay que poder
   explicar el resultado en una oración a una familia.
3. **Sesgo histórico.** Un modelo entrenado sobre decisiones pasadas reproduce sus
   sesgos con apariencia de objetividad.
4. **Solidez jurídica.** Una consecuencia negativa derivada exclusivamente de tratamiento
   automatizado es frágil. Ver `docs/07`.
5. **Defensa pública.** Ante una nota periodística, "esta es la regla escrita que se
   aplicó" funciona; "el algoritmo lo decidió" no.
6. **Evidencia comparada.** La literatura sobre el caso chileno muestra que la ganancia
   de los modelos complejos sobre la regresión logística es real pero moderada, y se
   paga con explicabilidad.

## Consecuencias

**Positivas:** auditable; se puede construir ya; cualquier persona del área entiende y
discute los pesos; no hay riesgo de caja negra.

**Negativas:** menor capacidad predictiva que un buen modelo con datos suficientes; los
pesos iniciales son un juicio experto y hay que calibrarlos; requiere revisión periódica.

**Deuda asumida:** el sistema registra desde el día uno todas las variables necesarias
para entrenar. La puerta queda abierta y la llave, guardada.

## Cómo se revisa

Con tres ciclos de datos: se entrena un modelo, se lo compara contra las reglas sobre el
mismo conjunto de prueba, y **solo si gana de manera significativa** se adopta en modo
asistido — nunca decisorio. La revisión se documenta en un ADR nuevo, no editando este.
