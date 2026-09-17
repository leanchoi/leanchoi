# 07 · Gobernanza de datos, marco legal y accesibilidad

> ⚠️ Este documento fija criterios de diseño, **no constituye asesoramiento jurídico**.
> Todo lo que sigue debe validarse con la Asesoría Letrada del municipio antes de la
> puesta en producción. Lo que sí hace este documento es asegurar que, cuando esa
> validación ocurra, no haya que rediseñar el sistema.

---

## 1. Marco normativo aplicable

| Norma | Qué regula | Implicancia directa |
|---|---|---|
| **Ley 25.326** — Protección de Datos Personales | Tratamiento de datos personales, datos sensibles, derechos del titular | Base legal, finalidad, minimización, derechos de acceso y rectificación, seguridad |
| **Ley 27.275** — Acceso a la Información Pública | Transparencia activa y pasiva | Fundamenta el portal de datos abiertos |
| **Ley 26.061** — Protección Integral de Niñas, Niños y Adolescentes | Interés superior del niño, derecho a la imagen y a la intimidad | Condiciona todo el tratamiento de menores, que en el PAE son mayoría |
| Normativa provincial de Chubut y ordenanzas municipales | Régimen local | **A relevar con Asesoría Letrada (incógnita D1 y D6)** |
| Ordenanza de creación del PAE | Reglas del programa | Define qué se cambia por resolución y qué requiere el Concejo |

> **El régimen de protección de datos argentino ha estado en proceso de actualización.**
> Antes de producción hay que verificar cuál es el texto vigente y si hay normativa
> provincial o municipal específica que aplique.

---

## 2. Los principios, traducidos a requisitos técnicos

| Principio legal | Requisito en el software |
|---|---|
| **Finalidad** | Cada campo tiene declarada su finalidad en el esquema. Un dato recogido para liquidar un pago no se usa para evaluar riesgo sin base expresa |
| **Minimización** | Antes de agregar un campo hay que responder *"¿qué decisión cambia este dato?"*. Sin respuesta, no entra |
| **Calidad** | Distinción obligatoria entre dato declarado y verificado, con fecha |
| **Consentimiento informado** | Texto claro, en lenguaje llano, sin letra chica, con casillas separadas por finalidad y **nunca premarcadas** |
| **Derecho de acceso** | Pantalla "Mis datos" donde el estudiante ve todo lo que el municipio tiene sobre él |
| **Derecho de rectificación** | Canal de corrección con plazo de respuesta comprometido |
| **Seguridad** | Cifrado en tránsito y en reposo, control de acceso por rol, bitácora, respaldos verificados |
| **Interés superior del niño** | Para menores, el consentimiento lo presta el adulto responsable; la evidencia fotográfica tiene reglas reforzadas (§4) |

---

## 3. La decisión que nunca es automática

> **Ninguna consecuencia negativa para una persona puede originarse exclusivamente en un
> tratamiento automatizado.**

Traducido a reglas del sistema:

| El sistema PUEDE | El sistema NO PUEDE |
|---|---|
| Calcular un puntaje de riesgo | Suspender un pago por sí solo |
| Priorizar una bandeja de trabajo | Rechazar una postulación sin revisión humana |
| Sugerir una acción | Dar de baja a un beneficiario |
| Detectar una inconsistencia en un cruce | Concluir que hubo fraude |
| Enviar un recordatorio automático | Enviar una intimación automática |

Y siempre queda registrado **quién** tomó la decisión, con qué fundamento y sobre qué
información.

---

## 4. Geolocalización y evidencia fotográfica — el punto más delicado

Es donde el proyecto puede meterse en problemas si se diseña con liviandad.

### Lo que NO se hace

- ❌ Seguimiento continuo de ubicación.
- ❌ Ubicación en segundo plano.
- ❌ Almacenar la traza de movimientos de una persona.
- ❌ Fotografiar a terceros, en especial menores, sin consentimiento expreso.
- ❌ Usar rostros como método de validación.

### Lo que SÍ se hace

- ✅ **Una única lectura de ubicación**, en el momento del check-in, **iniciada por el
  estudiante** con una acción explícita.
- ✅ Se guarda **solamente**: si cayó dentro de la geocerca (sí/no), la precisión
  reportada por el dispositivo, y el sello de tiempo. **No se guardan las coordenadas.**
- ✅ Si el estudiante deniega el permiso de ubicación, **el check-in funciona igual** y
  queda marcado para validación manual del referente. La negativa no puede impedir el
  cumplimiento de la obligación.
- ✅ La evidencia fotográfica documenta **la actividad, no a las personas**: la obra
  hecha, el taller montado, el espacio recuperado.
- ✅ Retención acotada de las fotos (24 meses) con borrado programado y verificable.

> **La frase para defenderlo en público:** *"El sistema no sigue a nadie. Registra que
> una persona estuvo en un lugar en un momento, porque ella misma apretó un botón para
> dejar constancia de que cumplió."* La diferencia entre vigilancia y constancia es quién
> inicia la acción, y hay que poder explicarla en una oración.

---

## 5. Variables prohibidas en el puntaje de riesgo

Impedidas a nivel de esquema, no por buena voluntad del programador:

| Prohibida | Por qué |
|---|---|
| Nacionalidad u origen étnico | Discriminación directa |
| Datos de salud o discapacidad | Categoría especial; su uso para riesgo es inadmisible |
| Religión, opinión política, afiliación sindical | Categoría especial |
| Situación penal de familiares | Responsabilidad personal |
| Barrio de residencia **como predictor** | Estigmatización territorial |

> **La última merece explicación**, porque es la más tentadora y la más sutil. El barrio
> **sí** se usa para *asignar recursos* (dónde poner un taller, a qué sede reforzar) y
> **no** se usa para *puntuar personas*. Usar el barrio como predictor de riesgo
> individual significa que un chico arranca con peor puntaje por vivir donde vive. Eso es
> exactamente el mecanismo por el cual un sistema "objetivo" reproduce y amplifica la
> desigualdad que decía combatir.
>
> **Mismo dato, dos usos: uno legítimo y uno inaceptable.** Que el equipo entienda esta
> distinción vale más que cualquier funcionalidad del sistema.

---

## 6. Transparencia activa

El portal público publica, sin necesidad de pedirlo:

| Se publica | Nunca se publica |
|---|---|
| Reglas del programa y criterios de elegibilidad | Nombres de beneficiarios |
| Monto vigente y fórmula de actualización | Documentos de identidad |
| Cantidad de beneficiarios por nivel y por barrio (**con supresión de celdas chicas**) | Datos de ingresos individuales |
| Ejecución presupuestaria agregada | Domicilios |
| Horas comunitarias totales y por tipo de proyecto | Fotos de evidencia |
| Indicadores de resultado y metodología del SROI | Cualquier dato que permita reidentificar |

**Supresión de celdas chicas:** ningún cruce puede publicarse si el resultado deja menos
de 5 personas en una celda. En una ciudad del tamaño de Esquel, *"2 beneficiarios de
nivel superior en el barrio X"* alcanza para que el vecindario sepa exactamente de quién
se habla. **La anonimización estadística es distinta en una ciudad chica que en una
grande, y este es el error de privacidad más común en datos abiertos municipales.**

---

## 7. Accesibilidad

Objetivo: **WCAG 2.2 nivel AA**, verificado, no declarado.

| Requisito | Verificación |
|---|---|
| Contraste mínimo en texto e interfaz | Validado con herramienta, incluido modo oscuro |
| Navegación completa por teclado | Recorrido manual de cada formulario |
| Etiquetas y errores asociados programáticamente | Revisión con lector de pantalla |
| Sin dependencia exclusiva del color | Estados con ícono y texto, siempre |
| Texto redimensionable hasta 200% sin pérdida | Prueba en móvil |
| Lenguaje llano | Revisión de todos los textos: objetivo de lectura fácil |

> El lenguaje llano es un requisito de accesibilidad, no de estilo. *"Su solicitud se
> encuentra en instancia de evaluación"* y *"Estamos revisando tu pedido. Te avisamos
> antes del 15 de marzo"* dicen lo mismo, pero solo una de las dos sirve.

---

## 8. Seguridad — el mínimo serio

| Control | Implementación |
|---|---|
| Cifrado en tránsito | TLS obligatorio, HSTS |
| Cifrado en reposo | Volúmenes cifrados; datos sensibles con cifrado a nivel de campo |
| Autenticación | Sesión propia; **segundo factor obligatorio** para roles con acceso a datos sensibles |
| Autorización | Control por rol verificado en el servidor, nunca solo en la interfaz |
| Respaldos | Diarios, cifrados, fuera del servidor, **con prueba de restauración mensual** |
| Bitácora | Inmutable, con retención de 10 años |
| Gestión de secretos | Variables de entorno, nunca en el repositorio |
| Dependencias | Revisión automatizada de vulnerabilidades |

> **Un respaldo que nunca se restauró no es un respaldo: es una carpeta.** La prueba
> mensual de restauración es el control más barato y el que más veces salva un proyecto.

---

## 9. Lo que hay que llevar a Asesoría Letrada

Agenda concreta para esa reunión:

1. ¿Qué ordenanza o resolución crea y regula el PAE? ¿Qué se puede modificar por
   resolución del Ejecutivo y qué requiere al Concejo Deliberante?
2. ¿El municipio tiene un responsable de protección de datos designado?
3. ¿Hay ordenanza municipal de datos personales o de gobierno abierto?
4. ¿Existe convenio vigente con SINTyS? Si no, ¿cuál es el circuito para firmarlo?
5. ¿Qué texto de consentimiento usa hoy el programa? ¿Cubre el tratamiento digital?
6. Para menores de edad, ¿cómo se instrumenta el consentimiento del adulto responsable?
7. ¿La fórmula de actualización del monto requiere ordenanza o alcanza una resolución?

> La pregunta 7 es la más importante del proyecto y conviene hacerla temprano: define si
> la corrección de la licuación —el hallazgo más fuerte del diagnóstico— es una decisión
> de escritorio o una negociación política con el Concejo. Ver `adr/ADR-004`.
