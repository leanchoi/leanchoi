# 08 · Plan de implementación

## 1. El reloj manda

**La convocatoria del PAE abre en febrero.** Todo el plan se construye hacia atrás desde
esa fecha, porque es la única ventana del año en que el programa recibe a toda su
población de una sola vez.

> Si la plataforma no llega a febrero, no se pierde un mes: se pierde un ciclo entero.
> Doce meses de espera, y con ellos el impulso político del proyecto.

```
     SEP        OCT        NOV        DIC        ENE        FEB        ...       AGO
2026 ──┬─────────┬──────────┬──────────┬──────────┬──────────┬─────────────────┬──
       │ FASE 0  │          │  FASE 1  │  FASE 2  │          │    FASE 3       │ FASE 4
       │ Diagnós.│          │  Piloto  │  Capacit.│          │  Convocatoria   │ Rendición
       │ de datos│          │  superior│  vecinal │          │  100% digital   │ pública
       └─────────┴──────────┴──────────┴──────────┴──────────┴─────────────────┴──
           ▲                     ▲                                ▲              ▲
       el primer            el padrón real                   el lanzamiento   la cosecha
       número duro          en el sistema                                      política
```

---

## 2. Fase 0 · Diagnóstico de datos (septiembre–octubre 2026)

**Objetivo:** producir el primer número duro sin escribir una línea de código de
producción y sin pedir un peso.

| Actividad | Entregable |
|---|---|
| Relevar el circuito completo del trámite, punta a punta | Mapa del proceso actual, con tiempos por etapa |
| Auditar la calidad del padrón vigente | Informe: duplicados, datos faltantes, inconsistencias |
| Reconstruir cohortes 2023–2025 | Tasa de permanencia histórica — **la línea base** |
| Medir la carga administrativa real | Horas/persona dedicadas al programa |
| Relevar el marco normativo | Qué se cambia por resolución y qué no |
| Verificar convenio SINTyS | Sí/no y circuito para firmarlo |
| Calcular la licuación del monto y del tope | **El gráfico que cambia la conversación** |

**Recursos necesarios:** acceso de lectura al padrón, una reunión de una hora con el
área, y autorización para presentar resultados. Cero presupuesto.

> ### El entregable que define todo
>
> El cierre de la Fase 0 es **una sola lámina** con tres números:
>
> 1. *"El X% de los registros del padrón tiene inconsistencias detectables."*
> 2. *"El monto de la beca perdió Y% de su poder de compra durante el ciclo."*
> 3. *"El equipo dedica Z horas por mes a tareas que el sistema haría solo."*
>
> Si esos tres números aparecen en una lámina, el proyecto se aprueba solo. **No hace
> falta pedir nada más: hace falta mostrar esto.**

**Criterio de salida:** la lámina presentada y una decisión explícita de continuar.

---

## 3. Fase 1 · Piloto de nivel superior (noviembre 2026)

**Objetivo:** validar el módulo más crítico —el compromiso comunitario— con usuarios
reales, en escala chica y con riesgo controlado.

**Alcance deliberadamente acotado:**

| Dentro | Fuera |
|---|---|
| Solo becarios de nivel superior | Primario y secundario |
| 2 sedes vecinales | Las 18 juntas |
| Check-in QR + evidencia + validación | Pagos, inscripción, alertas |
| Padrón real del ciclo vigente | Migración histórica completa |

**Elección de las dos sedes:** una de alta actividad y una que necesite fortalecerse.
El criterio lo define la Dirección de Juntas Vecinales — **es su decisión, y eso es
deliberado**: convierte a Gastón en dueño de una parte del piloto desde el minuto cero.
Ver `interno/04-alianza-gaston.md`.

**Métricas de éxito del piloto:**

| Métrica | Umbral para avanzar |
|---|---|
| Check-ins completados sin asistencia técnica | ≥ 80% |
| Horas validadas por el referente en ≤ 48 hs | ≥ 90% |
| Estudiantes que completan el ciclo sin abandonar la herramienta | ≥ 85% |
| Referentes vecinales que la usarían de nuevo | ≥ 4/5 |

> **Si el piloto falla, se dice que falló y se corrige.** Un piloto que "sale bien"
> siempre, por definición, no era un piloto: era una demostración. La credibilidad
> técnica se construye reportando el resultado malo la primera vez.

---

## 4. Fase 2 · Capacitación y co-diseño vecinal (diciembre 2026 – enero 2027)

**Objetivo:** que las juntas vecinales lleguen a febrero como **dueñas** del sistema, no
como usuarias obligadas.

| Actividad | Detalle |
|---|---|
| Taller con referentes de las 18 juntas | En sus sedes, no en el municipio. **Esto importa** |
| Manual de una carilla | Una hoja plastificada por sede. No un PDF de 40 páginas |
| Formación de referentes multiplicadores | 3–4 personas que enseñan al resto |
| Carga del catálogo de proyectos | Cada sede publica lo que necesita |
| Capacitación del equipo técnico del área | Operación diaria y protocolo de alertas |
| Ajustes por devolución | **Presupuesto de tiempo reservado para cambiar cosas** |

> **La última fila es la que nadie planifica y la que decide si el sistema se adopta.**
> Si los referentes piden un cambio y el cambio nunca llega, dejan de pedir — y poco
> después dejan de usar. Reservar dos semanas para implementar devoluciones del taller
> no es una concesión: es el mecanismo por el cual el sistema se vuelve de ellos.

---

## 5. Fase 3 · Convocatoria 100% digital (febrero 2027)

**El momento de la verdad.** Toda la población del programa entra en tres semanas.

### Preparación

| Control | Estado requerido antes de abrir |
|---|---|
| Prueba de carga con 3× el volumen esperado | ✅ |
| Canal asistido presencial montado y con personal | ✅ |
| Plan de contingencia en papel documentado y probado | ✅ |
| Guardia técnica durante toda la ventana | ✅ |
| Respaldos automáticos **con restauración probada** | ✅ |
| Textos revisados en lenguaje llano | ✅ |
| Accesibilidad verificada | ✅ |

### El plan de contingencia no es opcional

> Si el sistema se cae el 12 de febrero, **el trámite sigue en papel y nadie pierde la
> beca.** El procedimiento está escrito, impreso y en manos del área antes de abrir la
> convocatoria.
>
> Esta es la diferencia entre digitalizar un servicio y ponerlo en riesgo. Un municipio
> no puede darse el lujo de que una falla de software le impida a una familia acceder a
> un derecho. **El papel es el respaldo, no el enemigo.**

### Comunicación

Ver `09-comunicacion-publica.md`. Regla de secuencia: **las reglas se publican antes de
que abra la inscripción**, nunca durante ni después.

---

## 6. Fase 4 · Rendición pública (agosto 2027)

**Objetivo:** cerrar el círculo y cosechar. Un proyecto que no rinde cuentas
públicamente no genera capital político: genera sospecha.

| Entregable | Formato |
|---|---|
| Informe de resultados del primer ciclo | Público, con metodología |
| Portal de datos abiertos | En línea, actualizado |
| Primer cálculo de SROI | Con supuestos publicados y rango de sensibilidad |
| Evaluación contra el grupo de comparación | Lista de espera vs admitidos |
| Devolución a las juntas vecinales | Presentación en sus sedes, primero a ellas |

> **La última fila es política pura y conviene ser explícito:** los resultados se
> presentan **primero a las juntas vecinales y después a la prensa**. Enterarse por el
> diario de algo que uno ayudó a construir es la forma más eficiente de perder un aliado.

---

## 7. Fase 5 y siguientes · Expansión

| Momento | Qué se suma |
|---|---|
| Ciclo 2027 en curso | Bot de WhatsApp, credencial verificable |
| Cierre 2027 | Módulo de matching laboral completo |
| 2028 | Seguimiento post-egreso y primera tasa de arraigo |
| 2028 | Apertura del padrón a otros programas municipales |
| 2029 | Evaluación de modelo predictivo contra las reglas (`adr/ADR-001`) |

---

## 8. Riesgos y mitigaciones

| # | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| R1 | El área percibe el sistema como intromisión | Alta | Alto | Co-diseño desde Fase 0; la Directora es la dueña visible del proyecto |
| R2 | Se lee como recorte encubierto | Media | **Crítico** | Narrativa de optimización + publicar reglas antes; nunca anunciar bajas como logro |
| R3 | Brecha digital genera exclusión | Alta | Alto | Canal asistido obligatorio; sedes como puntos de acceso; diseño liviano |
| R4 | El proyecto depende de una sola persona | Alta | Alto | Documentación en repositorio, código del municipio, formación de un segundo |
| R5 | Cambio de gestión o de funcionario | Media | Alto | Datos abiertos y resultados publicados: el costo político de desarmarlo crece |
| R6 | Tesorería no adopta el circuito | Media | Medio | El sistema se adapta al formato de ellos, no al revés |
| R7 | Calidad del dato de origen insuficiente | Alta | Medio | Fase 0 lo mide antes de comprometer nada |
| R8 | Falla técnica durante la convocatoria | Media | **Crítico** | Plan de contingencia en papel, probado |
| R9 | Reclamo público por un caso individual | Media | Alto | Bitácora auditable + protocolo de respuesta ya escrito |

> **R4 merece una nota personal.** Un proyecto que depende de una sola persona es frágil
> para el municipio **y también para esa persona**: quien es imprescindible en la
> operación diaria no puede ascender, porque no lo pueden mover de lugar.
>
> La jugada correcta es contraintuitiva: **hacerse reemplazable en la operación e
> imprescindible en el diseño.** Ver `interno/05-cargo-coordinador-general.md`.

---

## 9. Definición de terminado

Una funcionalidad está terminada cuando:

- [ ] Funciona en un teléfono de gama baja con conexión mala
- [ ] Tiene su camino alternativo en papel documentado
- [ ] Sus textos están en lenguaje llano y revisados
- [ ] Pasa la verificación de accesibilidad
- [ ] Registra en bitácora lo que tiene que registrar
- [ ] Tiene prueba automatizada de su regla de negocio crítica
- [ ] Está documentada para quien venga después
- [ ] **Una persona del área la usó sin que nadie le explicara cómo**

> El último punto es el único que no se puede falsear. Los demás los puede marcar uno
> mismo; ese lo marca la realidad.
