# ADR-003 · Evidencia geolocalizada con minimización, y gamificación sin ranking

**Estado:** aceptada · **Fecha:** septiembre 2026

## Contexto

Dos requisitos con riesgo ético alto:

1. Verificar que las horas de compromiso comunitario efectivamente ocurrieron.
2. Sostener la motivación de los estudiantes a lo largo del ciclo.

La solución obvia para (1) es geolocalización; la solución obvia para (2) es
gamificación con tabla de posiciones. **Las dos soluciones obvias son peligrosas.**

## Decisión — parte A: evidencia

Se implementa check-in con QR + validación de geocerca, con estas restricciones duras:

- Lectura de ubicación **única**, en el momento, **iniciada por el estudiante**.
- Se persiste **únicamente**: dentro/fuera de la geocerca, precisión reportada y sello de
  tiempo. **No se persisten coordenadas.**
- Sin ubicación en segundo plano ni seguimiento continuo, en ninguna circunstancia.
- Si el estudiante deniega el permiso, **el check-in funciona igual** y pasa a validación
  manual del referente. La negativa nunca impide cumplir.
- La evidencia fotográfica documenta la actividad, no a las personas.
- Retención de fotos: 24 meses, con borrado programado y verificable.

## Decisión — parte B: gamificación

Se implementan mecánicas de **progreso y pertenencia**, y se prohíben explícitamente las
de **competencia individual**:

| Permitido | Prohibido |
|---|---|
| Progreso contra la propia meta | Ranking público de estudiantes |
| Rachas de constancia | Comparación visible entre personas |
| Logros por competencia verificable | Insignias infantilizantes |
| Metas colectivas por sede o barrio | Exposición de cualquier dato socioeconómico |

## Fundamento

Sobre la ubicación: la diferencia entre **vigilancia** y **constancia** es quién inicia
la acción y qué se conserva. Un sistema que guarda dónde estuvo una persona es
vigilancia. Un sistema que guarda que una persona dejó constancia de haber estado en un
lugar, porque apretó un botón, es un registro de asistencia. La distinción es jurídica,
es ética y **tiene que poder explicarse en una oración en una entrevista**.

Sobre la gamificación: una tabla de posiciones entre becarios de un programa social
convierte la vulnerabilidad en competencia y expone a quien menos puede. Un estudiante
que trabaja y no puede cumplir horas aparecería público en el último puesto, y el
programa habría producido humillación con dinero público.

## Consecuencias

**Positivas:** defendible ante cualquier cuestionamiento; minimiza la superficie legal;
la motivación se apoya en pertenencia, que sostiene mejor en el tiempo que la competencia.

**Negativas:** la validación por geocerca es menos estricta (se puede hacer check-in en
la puerta y no entrar) — se acepta, y se compensa con la validación del referente y la
auditoría por muestreo. Se resigna el efecto motivacional de corto plazo del ranking.

**Regla de decisión para el futuro:** si un elemento de juego puede hacer que alguien se
sienta expuesto por ser pobre, no entra. Sin excepciones y sin discusión.
