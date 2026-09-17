# 06 · Motor de riesgo, protocolo de intervención y matching

## Parte I · El motor de riesgo

### 1. Por qué reglas y no inteligencia artificial (todavía)

La pregunta *"¿esto no se puede hacer con IA?"* va a aparecer en la primera reunión.
La respuesta correcta —y la que demuestra criterio— es:

> **Sí se puede, y por eso mismo todavía no conviene.**

| Argumento | Detalle |
|---|---|
| **Volumen** | Con del orden de 80 a 500 becarios por ciclo, un modelo predictivo no tiene de dónde aprender. Aprendería el ruido |
| **Explicabilidad** | Una decisión que afecta el acceso a un beneficio tiene que poder explicarse a una familia en una oración. Un modelo que dice "riesgo 0,78" y no puede decir por qué es indefendible ante un reclamo |
| **Sesgo** | Un modelo entrenado sobre decisiones históricas aprende los sesgos históricos y los aplica con apariencia de objetividad. En política social eso es grave |
| **Legal** | Una decisión que afecta derechos basada exclusivamente en tratamiento automatizado, sin intervención humana fundada, es jurídicamente frágil |
| **Político** | Cuando algo salga mal —y algo va a salir mal— hay que poder mostrar la regla escrita que se aplicó. "El algoritmo lo decidió" no es una respuesta que sobreviva una nota periodística |

**Y sin embargo, la puerta queda abierta:** el sistema registra desde el día uno todas
las variables necesarias para entrenar un modelo. Cuando existan tres ciclos de datos
propios, se entrena un modelo, **se lo compara contra las reglas**, y si gana de manera
significativa se adopta en modo asistido — nunca decisorio. Ver `adr/ADR-001`.

Es exactamente lo que muestra la evidencia chilena: la ganancia de los modelos complejos
sobre la regresión logística es real pero moderada, y se paga con explicabilidad.

### 2. Las señales

| Señal | Peso | Umbral de disparo | Origen |
|---|---|---|---|
| Regularidad vencida sin renovar | Alto | > 15 días | M2 |
| Caída de rendimiento académico | Alto | Materias adeudadas > umbral del nivel | M2 |
| Horas comunitarias atrasadas | Medio | < 60% del avance esperado a la fecha | M3 |
| Inasistencia a actividad asignada | Medio | 2 faltas consecutivas sin aviso | M3 |
| Sin contacto efectivo | Medio | > 45 días sin interacción | M1/M7 |
| Cambio en composición o ingresos del hogar | Alto | Reportado o detectado en cruce | M1 |
| Rechazo bancario de pago | Alto | Cualquiera | M5 |
| Trayectoria descendente sostenida | Alto | 2 períodos consecutivos a la baja | M2 |
| Alerta derivada de otra área | Crítico | Cualquiera | Interoperabilidad |

### 3. El puntaje

```
riesgo = Σ (peso_señal × intensidad_señal × factor_recencia)
```

Con tres reglas que lo mantienen honesto:

1. **El puntaje se muestra siempre descompuesto.** Nunca el número solo. La pantalla dice:
   *"Riesgo alto — regularidad vencida hace 22 días (+40), horas al 45% de lo esperado
   (+25), sin contacto hace 51 días (+20)"*.
2. **Es reproducible.** Mismo dato, mismo puntaje, siempre. Sin aleatoriedad.
3. **Las variables prohibidas están prohibidas por diseño, no por buena voluntad.**
   Nacionalidad, origen étnico, salud, religión, situación de discapacidad y datos del
   hogar no vinculados a la trayectoria **no entran al puntaje**, y el esquema lo impide
   estructuralmente. Ver `07-gobernanza-datos-y-legal.md`.

### 4. El protocolo — la parte que Chile no resolvió

Un puntaje sin protocolo no sirve para nada. Toda alerta nace con:

| Campo | Obligatorio | Regla |
|---|---|---|
| Responsable | Sí | Asignación automática por carga y territorio |
| SLA | Sí | Según severidad (`docs/04` §M4) |
| Bitácora de intervención | Sí | **No se puede cerrar una alerta sin registrar qué se hizo** |
| Resultado | Sí | Resuelta / derivada / sin respuesta / escalada |
| Escalamiento | Automático | Al vencer el SLA, sube de nivel sola |

**Ninguna alerta puede cerrarse con "sin acción".** Si no se hizo nada, la alerta sigue
abierta y escala. Es la única forma de que el sistema no se convierta en un tablero
lindo que nadie mira.

### 5. La regla de oro

> **El sistema nunca da de baja a nadie.**
>
> El sistema detecta, prioriza, asigna, recuerda y registra. **Una persona decide y
> firma.** Siempre.

Esto no es una limitación técnica: es la decisión de diseño más importante del proyecto.
Protege al beneficiario del error algorítmico, protege al funcionario de tener que
defender una decisión que no tomó, y protege al programa de la acusación más peligrosa
que puede recibir.

---

## Parte II · Puente Esquel — el motor de matching

### 6. El problema que resuelve

Dos problemas que en realidad son el mismo:

- **Corto plazo:** a un estudiante de enfermería se le asignan horas comunitarias
  barriendo una sede. El municipio pierde el valor de su formación y el estudiante
  percibe la obligación como castigo.
- **Largo plazo:** el municipio financia carreras sin conectarlas nunca con la demanda
  productiva local, y el egresado se va.

### 7. Cómo funciona

```
PERFIL DEL ESTUDIANTE          DEMANDA REGISTRADA
───────────────────────        ──────────────────────
· carrera y año                · competencias buscadas
· competencias declaradas      · barrio / sede
· competencias verificadas     · horario
  (por horas ya cumplidas)     · perfil deseado
· barrio de residencia         · cupo
· disponibilidad horaria              │
· intereses                           │
         │                            │
         └────────► AFINIDAD ◄────────┘
                       │
         ┌─────────────┴─────────────┐
         ▼                           ▼
  Sugerencia de proyecto      Oportunidad laboral
  (durante la beca)           (al egresar)
```

Puntaje de afinidad con factores visibles:

| Factor | Peso sugerido |
|---|---|
| Coincidencia de competencias con la carrera | 35% |
| Compatibilidad horaria | 25% |
| Cercanía territorial (mismo barrio o adyacente) | 20% |
| Interés declarado por el estudiante | 15% |
| Necesidad de la sede (antigüedad de la vacante) | 5% |

**El estudiante siempre ve por qué se le sugirió algo, y siempre puede elegir otra
cosa.** El sistema sugiere; no asigna a la fuerza. Una asignación forzada mata el
cumplimiento voluntario, que es el único que escala.

### 8. Ejemplos concretos de emparejamiento

| Estudiante | Proyecto sugerido | Valor doble |
|---|---|---|
| Enfermería, 2° año | Apoyo en campaña de salud en sede barrial | Practica su carrera; el barrio recibe atención |
| Profesorado de Matemática | Apoyo escolar a becarios de secundario del PAE | **El programa se enseña a sí mismo**: el becario superior tutorea al becario secundario |
| Informática / sistemas | Alfabetización digital para adultos mayores en la sede | Cierra la brecha digital que el propio sistema podría abrir |
| Turismo | Relevamiento y señalización de senderos y atractivos | Producto concreto para el área de Turismo |
| Forestal / agronomía | Vivero y arbolado urbano con la junta vecinal | Vinculación natural con instituciones técnicas de la región |
| Trabajo social | Acompañamiento de casos con alerta media del propio PAE | Formación en terreno con supervisión profesional |

> **El segundo caso es el más potente del proyecto.** Que becarios de nivel superior den
> apoyo escolar a becarios de secundario convierte el programa en un sistema que se
> retroalimenta: mejora la retención del secundario, le da práctica profesional al
> terciario, no cuesta un peso adicional y **es un titular de prensa por sí solo**.
>
> Si hay que elegir un solo proyecto piloto para el compromiso comunitario, es este.

### 9. Fase 2 — del matching al empleo

Al egresar, el mismo motor conecta con:
- vacantes de las áreas municipales,
- demanda relevada en cámaras y empresas locales,
- programas de prácticas y primer empleo,
- instituciones de ciencia y técnica con presencia regional.

Y ahí se mide la **tasa de arraigo**, que es adonde apunta todo esto.

### 10. Advertencia sobre el alcance

El municipio **no es una agencia de empleo** y no debe prometer trabajo. Lo que ofrece es
**conexión e información**, no colocación. Prometer empleo y no cumplirlo es la forma más
rápida de destruir la confianza que el resto del sistema construye.

El lenguaje correcto es *"te conectamos con oportunidades locales"*, nunca *"te
conseguimos trabajo"*. Esta distinción va escrita en la interfaz, no solo en el discurso.
