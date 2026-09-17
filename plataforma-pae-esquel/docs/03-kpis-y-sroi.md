# 03 · Indicadores, KPIs y Retorno Social de la Inversión (SROI)

## 1. La pirámide de medición

Cada indicador responde a una pregunta distinta y se lo pide un interlocutor distinto.
Confundir los niveles es el error clásico: llevarle al Intendente indicadores de gestión
operativa, o pedirle al equipo técnico que rinda impacto de largo plazo.

| Nivel | Pregunta que responde | Quién lo pide | Frecuencia |
|---|---|---|---|
| **Insumo** | ¿Cuánto se puso? | Contaduría, Concejo | Mensual |
| **Producto** | ¿Qué se entregó? | Dirección de Educación | Mensual |
| **Resultado** | ¿Qué cambió en la gente? | Intendencia | Semestral / anual |
| **Impacto** | ¿Valió la pena? | Ciudadanía, prensa, Concejo | Anual / trienal |
| **Proceso** | ¿Funciona la máquina? | Coordinación / equipo | Semanal |

---

## 2. Tablero de indicadores

### 2.1 Insumo y ejecución

| KPI | Fórmula | Frecuencia | Meta sugerida año 1 |
|---|---|---|---|
| Ejecución presupuestaria | Devengado ÷ presupuestado | Mensual | 95–100% |
| **Poder de compra real del monto** | Monto nominal ÷ IPC, base = mes de resolución | Mensual | ≥ 95 (índice) |
| Costo administrativo por beneficiario | Gasto de gestión ÷ beneficiarios activos | Trimestral | ↓ 30% vs línea base |
| Desvío de puntualidad de pago | Días entre fecha comprometida y acreditación | Mensual | ≤ 2 días |

> El segundo indicador es **el más importante del bloque y el que hoy no existe**. Es el
> que hace visible la licuación. Ver `docs/01`, falla F2 y `adr/ADR-004`.

### 2.2 Producto y cobertura

| KPI | Fórmula | Frecuencia | Meta |
|---|---|---|---|
| Cobertura efectiva | Beneficiarios activos ÷ población objetivo estimada | Semestral | Definir en Fase 0 |
| Tasa de conversión de la convocatoria | Admitidos ÷ postulantes iniciados | Por ciclo | Monitorear abandono de formulario |
| Tiempo de trámite (*lead time*) | Días entre inicio de postulación y resolución | Por ciclo | ≤ 21 días |
| Trámites 100% digitales | Postulaciones sin papel ÷ total | Por ciclo | ≥ 80% en ciclo 1 |
| Índice *once-only* | Documentos reutilizados ÷ documentos requeridos | Por ciclo | ≥ 50% en ciclo 2 |

### 2.3 Focalización — el bloque que nadie mide

| KPI | Qué detecta | Cómo se estima |
|---|---|---|
| **Error de inclusión** | Beneficiarios que no cumplen criterios | Cruce SINTyS/ANSES + auditoría por muestreo |
| **Error de exclusión (subcobertura)** | Población elegible que no accede | Comparación del padrón contra registros escolares y de Desarrollo Humano |
| Tasa de superposición de beneficios | Beneficiarios con ayuda equivalente de otro nivel de gobierno | Cruce de bases |
| Brecha de acceso digital | % de postulaciones que requirieron canal asistido | Registro del canal de origen |

> **Advertencia de uso político:** el error de inclusión es el número que da titular, y
> el error de exclusión es el número que importa. Si el tablero solo muestra el primero,
> el programa deriva hacia la persecución del beneficiario y pierde su función. **Los dos
> se publican juntos, siempre.** Esta regla debería estar escrita en el acto
> administrativo que aprueba el sistema.

### 2.4 Resultado educativo

| KPI | Fórmula | Frecuencia | Meta |
|---|---|---|---|
| **Tasa de permanencia del ciclo** | Activos al cierre ÷ activos al inicio | Anual | ≥ 90% |
| Tasa de regularidad verificada | Con regularidad acreditada ÷ activos | Cuatrimestral | ≥ 95% |
| Tasa de egreso en tiempo teórico | Egresados en plazo ÷ cohorte | Anual | Línea base en Fase 0 |
| Tasa de reincorporación | Reingresados ÷ bajas por abandono | Anual | ≥ 25% |
| **Alertas atendidas dentro del SLA** | Alertas con intervención registrada en plazo ÷ alertas generadas | Mensual | ≥ 90% |

> El último es la métrica *anti-Chile*: mide la respuesta, no la detección. Ver `docs/02`.

### 2.5 Compromiso comunitario

| KPI | Fórmula | Frecuencia | Meta |
|---|---|---|---|
| Horas comprometidas vs cumplidas | Horas validadas ÷ horas comprometidas | Mensual | ≥ 85% |
| **Horas con evidencia verificable** | Horas con check-in + evidencia ÷ horas registradas | Mensual | ≥ 95% |
| Distribución territorial | Índice de concentración de horas por barrio | Trimestral | Evitar concentración en 2-3 sedes |
| Valor social del servicio prestado | Horas × costo horario de referencia | Anual | Se informa en pesos |
| Satisfacción de la sede receptora | Encuesta breve al referente vecinal | Trimestral | ≥ 4/5 |

### 2.6 Impacto de largo plazo — la apuesta diferencial

| KPI | Fórmula | Frecuencia | Por qué importa |
|---|---|---|---|
| **Tasa de arraigo a 24 meses** | Egresados residiendo y trabajando en Esquel ÷ egresados | Anual | El número que ningún municipio de la región puede reportar |
| **Tasa de arraigo a 36 meses** | Ídem, 3 años | Anual | Confirma si el arraigo es real o transitorio |
| Inserción laboral formal | Egresados con empleo registrado ÷ egresados | Anual | Requiere convenio de datos |
| Inserción en sectores prioritarios locales | Egresados empleados en sectores definidos como estratégicos | Anual | Mide si el *matching* funciona |
| **Costo por trayectoria completada** | Inversión total de la cohorte ÷ egresados | Anual | La métrica de eficiencia que entiende cualquier intendente |
| Tasa de retorno a la comunidad | Ex becarios que participan como tutores o referentes | Anual | Mide si el círculo se cierra |

---

## 3. Los tres indicadores de cabecera

De los ~25 anteriores, si hubiera que elegir tres para la pantalla principal del
Intendente:

| # | Indicador | Por qué este |
|---|---|---|
| 1 | **Costo por trayectoria completada** | Traduce política social a lenguaje de gestión. Es la respuesta a "¿en qué se va la plata?" |
| 2 | **Tasa de arraigo a 24 meses** | Es el diferencial estratégico y el titular periodístico |
| 3 | **Poder de compra real del monto** | Es el indicador de honestidad del programa: muestra si la ayuda mantiene su valor |

---

## 4. Retorno Social de la Inversión (SROI)

### 4.1 Qué es y qué no es

El SROI expresa en una razón monetaria el valor social generado por cada peso invertido:

```
                    Valor presente neto de los beneficios sociales
     SROI  =  ─────────────────────────────────────────────────────
                    Valor presente neto de la inversión
```

Un SROI de **3,4:1** significa: *por cada peso invertido, se generaron $3,40 de valor
social*.

> **Advertencia profesional, y conviene decirla en la presentación:** el SROI es tan
> creíble como sus supuestos. Es trivialmente manipulable: basta elegir proxies
> generosos y un horizonte largo para obtener el número que uno quiera. Por eso la regla
> del proyecto es que **el modelo de cálculo se publica completo, con todos sus supuestos
> y su hoja de cálculo abierta**. Un SROI publicado con supuestos auditables es
> evidencia. Un SROI presentado como número redondo sin memoria de cálculo es propaganda,
> y cuando alguien lo desarme se lleva puesta la credibilidad de todo el proyecto.

### 4.2 Las seis etapas del método

Se sigue la metodología estándar de valor social:

| Etapa | Qué se hace | Aplicación en el PAE |
|---|---|---|
| 1. Alcance y actores | Definir qué se mide y con quiénes | Estudiantes, familias, sedes vecinales, municipio, empleadores locales |
| 2. Mapa de resultados | Teoría del cambio: insumos → actividades → productos → resultados | Ver 4.3 |
| 3. Evidenciar y valorar | Asignar un proxy financiero a cada resultado | Ver 4.4 |
| 4. Establecer el impacto | Descontar lo que habría pasado igual | Ver 4.5 — **la etapa que todos saltean** |
| 5. Calcular | Valor presente neto y razón | Horizonte 5 años, tasa de descuento explícita |
| 6. Reportar y verificar | Publicar con supuestos y someter a revisión externa | Portal de transparencia + revisión de la UNPSJB o del CIEFAP |

### 4.3 Teoría del cambio del PAE

```
INSUMOS            ACTIVIDADES           PRODUCTOS            RESULTADOS           IMPACTO
─────────          ───────────           ─────────            ──────────           ───────
Presupuesto   →    Transferencia    →    Beca entregada  →    Continuidad     →    + Ingreso
municipal          monetaria             en término           educativa             de por vida

Equipo        →    Acompañamiento   →    Alertas          →   Menor              →  Menor gasto
técnico            y tutoría             atendidas            deserción             social futuro

Red de        →    Compromiso       →    Horas de         →   Vínculo           →  + Capital
sedes              comunitario           servicio             comunitario           social barrial
vecinales                                validadas            y experiencia

Vínculo       →    Matching con     →    Puentes al       →   Inserción         →  ARRAIGO
con Trabajo        demanda local         empleo local         laboral local         (retención
                                                                                    de talento)
```

### 4.4 Proxies financieros propuestos

| Resultado | Proxy financiero | Fuente del valor |
|---|---|---|
| Terminalidad de secundario | Diferencial de ingreso esperado entre nivel secundario completo e incompleto | EPH / INDEC, serie regional patagónica |
| Terminalidad de nivel superior | Diferencial adicional + mayor probabilidad de empleo registrado | EPH / INDEC |
| Deserción evitada | Ahorro fiscal esperado en programas de asistencia futuros | Costo per cápita de programas sociales municipales |
| Horas comunitarias prestadas | Horas × costo horario de un auxiliar/tallerista municipal | Escalafón municipal vigente |
| Arraigo profesional | Costo de reposición de un perfil equivalente en el mercado local | Consulta a cámaras empresarias y áreas municipales |
| Reducción de carga administrativa | Horas de personal liberadas × costo horario | Medición antes/después en Fase 0 y Fase 3 |

> **Todos los proxies se documentan con su fuente y su fecha.** Un proxy sin fuente
> invalida el ejercicio completo.

### 4.5 Los cuatro descuentos obligatorios

Esta es la etapa que separa un SROI serio de un folleto. Cada beneficio bruto se
descuenta por:

| Descuento | Pregunta | Cómo se estima en Esquel |
|---|---|---|
| **Peso muerto** (*deadweight*) | ¿Cuánto habría pasado igual sin el programa? | Comparación con la lista de espera de postulantes no admitidos de puntaje equivalente |
| **Atribución** | ¿Qué parte se debe a otros programas? | Identificar en el padrón quiénes reciben Progresar u otras ayudas y descontar proporcionalmente |
| **Desplazamiento** | ¿Se le quitó el beneficio a otro? | Evaluar si el puesto laboral obtenido desplaza a otro trabajador local |
| **Decaimiento** (*drop-off*) | ¿Cuánto dura el efecto? | Aplicar una tasa de decaimiento anual explícita sobre los beneficios de años posteriores |

**El grupo de comparación es la pieza clave y es gratis.** Basta con guardar
íntegramente los datos de los postulantes que quedaron fuera por cupo, con su puntaje de
elegibilidad, y hacerles seguimiento con el mismo instrumento. Quienes quedaron
inmediatamente por debajo de la línea de corte son casi idénticos a quienes quedaron
inmediatamente por encima: la diferencia posterior entre ambos grupos **es** el efecto del
programa.

> Esto hay que decidirlo **ahora**, antes de la convocatoria de febrero. Después no se
> puede reconstruir. Es la lección de Progresa, y es la razón por la que la Fase 0 tiene
> que estar cerrada antes de fin de año.

### 4.6 Cómo se reporta

Nunca un número solo. Siempre el formato:

> *"SROI estimado: **X,X : 1** (rango de sensibilidad: Y,Y – Z,Z), horizonte 5 años,
> tasa de descuento N%, descuentos aplicados por peso muerto (A%), atribución (B%) y
> decaimiento (C% anual). Memoria de cálculo completa en [enlace]."*

Con rango de sensibilidad. Con horizonte. Con enlace a los supuestos. Así no se cae.

---

## 5. Línea base: lo que hay que medir antes de tocar nada

Sin línea base no hay evaluación posible, y la línea base se levanta **una sola vez**.

| Qué medir | Cómo | Cuándo |
|---|---|---|
| Tiempo promedio de trámite actual | Muestreo de 30 expedientes del ciclo vigente | Fase 0 |
| Horas de personal dedicadas al programa | Registro de dos semanas típicas | Fase 0 |
| Calidad del padrón | Auditoría completa: duplicados, datos faltantes, inconsistencias | Fase 0 |
| Tasa de permanencia histórica | Reconstrucción de las cohortes 2023-2025 | Fase 0 |
| Situación actual de egresados | Contacto muestral con egresados 2023-2024 | Fase 0-1 |
| Percepción de estudiantes y familias | Encuesta breve, ≤ 8 preguntas | Fase 1 |

> **La Fase 0 es innegociable.** Un proyecto sin línea base no puede demostrar nada
> después, y el argumento entero de este informe se apoya en poder demostrar.
