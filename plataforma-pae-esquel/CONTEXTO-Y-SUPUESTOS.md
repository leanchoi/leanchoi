# Contexto verificado y supuestos de trabajo

> **Regla de la casa:** en una reunión con el Intendente, un supuesto presentado como
> dato te cuesta la reunión entera. Esta tabla existe para que nunca te pase.
> Todo lo que está en la columna 🟡 o 🔴 se dice en voz alta como supuesto.

Fecha de corte de la investigación: **17 de septiembre de 2026**.

---

## 🟢 Verificado con fuente pública

### El programa

| Dato | Detalle |
|---|---|
| Nombre | Programa de Apoyo a la Educación (PAE) |
| Área responsable | Área de Extensión Educativa, dependiente del área de Cultura y Educación del Municipio |
| Alcance | Nivel primario, secundario, terciario/universitario y centros de formación profesional |
| Población | Estudiantes de instituciones **públicas** de la ciudad de Esquel |
| Requisitos | Argentino/a nativo o por opción · alumno regular de institución pública · vivir y estudiar en Esquel · residencia mínima **3 años** · tope de ingresos del grupo familiar · **no percibir otra ayuda similar** |
| Tope de ingresos citado en convocatoria previa | $130.854 mensuales del grupo familiar |
| Componentes no monetarios | Actividades comunitarias · encuentros grupales · rendición mensual de gastos |
| Autodefinición oficial | *"Aunque se lo conoce como beca, es mucho más que eso, ya que establece una relación de acompañamiento y seguimiento con los estudiantes y sus familias"* |
| Escala observada | En 2021 se comunicaron **80 beneficiarios** en una convocatoria |
| Ventana de inscripción | Convocatoria de verano, del **8 al 26 de febrero** en un ciclo documentado; existen segundas convocatorias a mitad de año |

### Las personas

| Persona | Cargo | Desde | Dato relevante |
|---|---|---|---|
| **Matías Taccetta** | Intendente de Esquel | Dic. 2023 | Agenda declarada de ordenamiento de cuentas y eficiencia del gasto |
| **Aldana Roberts Marrero** | Directora de Educación | **Junio 2026** | Cargo vacante desde abril tras la renuncia de Daniela Otero. Su bandera declarada: *"seguir fortaleciendo la identidad de Esquel como ciudad educadora"* |
| **Gastón Escobar** | Director de Juntas Vecinales | **14 de septiembre de 2026** | Ex presidente de la Junta Vecinal del Barrio 28 de Junio (electo julio 2025). Prioridades declaradas: **regularizar juntas** (menciona Ceferino) y **mayor vinculación territorial entre áreas municipales**. Frase propia: *"No me perdonaría ser tibio y dejar postergado un barrio"* |
| **Diego Austin** | Secretario de Gobierno | — | Fue quien presentó públicamente a Aldana Roberts |
| **Fabiana Vázquez** | Secretaria de Desarrollo Humano, Salud y Hábitat | Mayo 2026 | Área con solapamiento potencial en criterios socioeconómicos |
| **César Navarro** | Unidad Ejecutora de Proyectos Municipales | Mayo 2026 | Contraparte natural para financiamiento de proyectos |

### El territorio

- Esquel tiene **18 juntas vecinales**.
- Barrios con junta identificados en fuentes públicas: Buenos Aires, Bella Vista,
  Lennart Englund, Malvinas, Matadero, Los Sauces, Sargento Cabral, Estación, Winter,
  Don Bosco, 28 de Junio, Ceferino.
- El listado completo y oficial de las 18 debe pedirse a la Dirección de Juntas
  Vecinales. **No lo inventes: pedíselo a Gastón — es tu primera excusa para reunirte.**

---

## 🟡 Supuesto de trabajo — alta confianza, confirmar en la primera reunión

| # | Supuesto | Cómo se confirma |
|---|---|---|
| S1 | El padrón se administra en planillas de cálculo y/o expediente en papel, sin base de datos relacional | Pedir ver la planilla del último ciclo |
| S2 | La contraprestación comunitaria del nivel superior se registra en planilla firmada por un referente | Pedir una planilla de horas de 2026 |
| S3 | El monto de la ayuda es nominal y se fija al inicio del ciclo, sin mecanismo de actualización | Pedir la resolución de montos de 2026 y la de 2025 |
| S4 | El tope de ingresos no se actualiza automáticamente | Comparar el tope de 2025 vs 2026 vs inflación del período |
| S5 | No hay cruce sistemático con bases nacionales/provinciales de beneficiarios | Preguntar si existe convenio SINTyS vigente |
| S6 | No existe seguimiento post-egreso ni medición de inserción laboral local | Preguntar qué pasó con los egresados de 2023-2024 |
| S7 | El pago se instrumenta por planilla enviada a Tesorería | Preguntar el circuito administrativo completo |

> Las siete preguntas de arriba son, literalmente, **la agenda de tu primera reunión con
> Aldana**. No lleves una propuesta: llevá estas preguntas. Ver `interno/03-venta-interna-aldana.md`.

---

## 🔴 Desconocido — bloquea decisiones de diseño

| # | Incógnita | Por qué bloquea |
|---|---|---|
| D1 | Ordenanza / resolución exacta que crea y regula el PAE | Define qué se puede cambiar por decisión administrativa y qué requiere el Concejo Deliberante |
| D2 | Partida presupuestaria y monto total anual del programa | Sin esto no hay cálculo de ahorro ni de SROI |
| D3 | Cantidad de beneficiarios activos por nivel en el ciclo 2026 | Determina la escala técnica (80 vs 800 son dos sistemas distintos) |
| D4 | Horas de contraprestación exigidas por nivel y su base normativa | Es el núcleo del módulo de compromiso comunitario |
| D5 | Sistema de gestión administrativo-contable del municipio y si expone API | Determina si la integración es automática o por exportación de archivo |
| D6 | Régimen de protección de datos aplicable a nivel municipal y existencia de un responsable | Condiciona todo el módulo de evidencias y geolocalización |
| D7 | Convenios vigentes con la provincia para acceder a regularidad escolar | Define si la regularidad se carga o se consulta |

---

## Sobre las cifras del prototipo

**Todos los números del prototipo (`prototipo/`) son sintéticos.** Fueron generados para
que las visualizaciones tengan forma realista y se pueda discutir la interfaz, no para
describir la realidad del PAE. El prototipo muestra un distintivo permanente
`DATOS DEMO` en pantalla, y ese distintivo **no se quita** hasta que haya datos reales
cargados.

Mostrar una pantalla con números inventados sin aclararlo es la forma más rápida de
perder credibilidad técnica de manera irreversible. El distintivo te protege a vos.

---

## Fuentes consultadas

- Municipalidad de Esquel — sitio oficial (`esquel.gov.ar`, `esquel.gob.ar`): convocatorias
  del PAE, presentación de Gastón Escobar como director de Juntas Vecinales,
  designación de Daniela Otero.
- Red43 — convocatorias PAE 2021 y 2023, designación de Aldana Roberts, entrevistas
  *"La idea es seguir fortaleciendo la identidad de Esquel como ciudad educadora"* y
  *"No me perdonaría ser tibio y dejar postergado un barrio"*, elecciones vecinales.
- EQSnotas, El Chubut, Diario Jornada, ADNSUR, La Tecla Patagonia, Canal 4 Esquel,
  Diario La Portada, Cholila Online, Metadata — cambios de gabinete 2025-2026.
- MINEDUC Chile — Sistema de Alerta Temprana (SAT) contra la deserción escolar:
  documentación oficial y guía de usuario.
- SciELO Chile — *An application of machine learning in public policy: early warning
  prediction of school dropout in the Chilean public education system*.

Las URL completas están en `docs/02-benchmark-internacional.md`.
