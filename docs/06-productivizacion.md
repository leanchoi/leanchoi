# 06 — Productivización: cómo esto no termina siendo un despelote

Este documento responde a la preocupación central: **no alcanza con tener los datos
cruzados; hay que convertirlos en algo que se entienda, se use y produzca decisiones.**
Es la capa que falta en el informe original, y la que decide si el proyecto se usa o
se abandona a los tres meses.

---

## 1. Cómo se arruinan estos sistemas

No fallan por falta de datos. Fallan siempre igual, y conviene nombrarlo para poder
diseñar contra eso:

| Modo de falla | Cómo se ve | Qué lo causa |
|---|---|---|
| **Proliferación** | 60 gráficos, nadie sabe cuál mirar primero | Cada pedido agrega una vista; nada se quita |
| **Ambigüedad semántica** | "Ocupación" significa tres cosas distintas en tres pestañas | No hay una definición canónica |
| **Insight huérfano** | Un número llamativo que no cambia ninguna decisión | Se midió porque se podía, no porque servía |
| **Falsa precisión** | Un dato modelado con 40% de cobertura se lee como un hecho | No se muestra la confianza |
| **Dependencia del intérprete** | Solo una persona sabe leer el tablero | El diagnóstico vive en la cabeza de alguien, no en el sistema |
| **Tablero de una sola vez** | Se mira en la presentación y nunca más | No está enganchado a un ciclo de decisión real |

Las siete capas que siguen atacan una falla cada una.

---

## 2. Principio ordenador

> **Cada número existe porque alguien va a hacer algo distinto al conocerlo.**

Operativamente: un indicador que no puede completar el campo `decision` no entra al
catálogo, y por lo tanto no entra al tablero. Es una regla dura y hay que sostenerla
sobre todo cuando el dato es interesante — que es cuando más cuesta.

---

## 3. Capa 1 — Catálogo de indicadores: una sola fuente de verdad

[`specs/catalogo/indicadores.yaml`](../specs/catalogo/indicadores.yaml) · 28 indicadores,
16 campos obligatorios cada uno.

```yaml
- id: exposicion_fiscal_ars
  nombre: Exposición fiscal del acuerdo de conectividad
  familia: riesgo
  definicion: Monto que la provincia aportaría si el LF cierra bajo el piso del 80%.
  formula: max(0, 0.80 - lf_proyectado) * butacas_periodo * tarifa_referencia
  unidad: ars
  grano: [ruta, periodo_acuerdo]
  fuentes: [air_fact_leadtime, ext_anac_mensual]
  confianza: C
  cobertura_minima: 0.80
  direccion: bajo
  interpretacion: Convierte cada punto de ocupación en pesos públicos.
  decision: Autoriza promoción intensiva o anticipa la previsión presupuestaria.
  destinatarios: [gestion, lobby]
  doc: docs/07#2
  version: 1
```

**No es documentación: es código fuente.** `specs/scripts/gen_catalogo.py` genera desde
ese archivo:

| Salida | Qué resuelve |
|---|---|
| `web/src/generated/indicadores.ts` | Tipos, etiquetas, tooltips y reglas de semáforo del tablero. Un `IndicadorId` mal escrito no compila |
| `etl/generated/indicadores.py` | `validar_columnas()` en `emit.py`: **una columna que no está en el catálogo aborta la emisión de esa tabla** |
| `docs/generated/ficha-metodologica.md` | Documentación pública, siempre sincronizada |

Y corre en CI con `--check`: si lo generado difiere de lo commiteado, el build falla.
Eso hace **estructuralmente imposible** que el tablero, el ETL y la documentación
digan cosas distintas. Es el antídoto contra la ambigüedad semántica y contra la
proliferación a la vez: agregar una métrica cuesta completar 16 campos, y ese costo es
deliberado.

**Nomenclatura** (validada por el generador):

```
sufijo de unidad:      _ars _usd _pct _ratio _idx _dias _pp _pernoctes _plazas
sufijo de agregación:  _med _p25 _p75 _min _max _sum
prefijo de tabla:      air_  ota_  x_  ext_
fechas:                fecha · flight_date · observed_date · lead_dias · lead_bucket
```

---

## 4. Capa 2 — Mapa de pregunta a decisión

Ninguna visualización entra al tablero sin una fila acá. Se escribe **antes** de
programar nada. Es lo que impide construir gráficos que nadie va a usar.

| # | Pregunta de negocio | Indicador | Visual | Quién decide | Qué decide |
|---|---|---|---|---|---|
| **Retrospectivas** | | | | | |
| R1 | ¿Por qué cayó la ocupación en ese período? | descomposición | Barra apilada con residuo | Gestión | Dónde intervenir |
| R2 | ¿Fue algo nuestro o de toda la Patagonia? | `ocupacion_oit_pct` vs cluster | Serie comparada | Gestión | Qué comunicar al sector |
| R3 | ¿El alojamiento local estuvo caro? | `ic_compensabilidad`, `adr_med_ars` | Tabla + umbral | Cámara hotelera | Defensa pública del sector |
| R4 | ¿Los vuelos estuvieron saturados? | `lf_real` (ANAC) | Serie + banda 80% | Gestión | Pedido de frecuencias |
| R5 | ¿Cuánto aportó realmente la ruta Córdoba? | efecto cuasi-experimental | Estimación con IC | Gestión + Provincia | **Renovar o no el acuerdo** |
| **Prospectivas** | | | | | |
| P1 | ¿Qué semanas vienen flojas a 30–90 días? | `iat_idx`, `pace_rel_ratio` | Panel de alerta | Gestión | Reasignar pauta |
| P2 | ¿Vamos a incumplir el piso del 80%? | `lf_proyectado_pct`, `exposicion_fiscal_ars` | Medidor vs umbral | Gestión + Hacienda | **Promoción intensiva o previsión presupuestaria** |
| P3 | ¿Conviene volar a Esquel o a Bariloche y manejar? | `ifpe_pct` | Tabla por fecha | Gestión | Corredor terrestre / reclamo tarifario |
| P4 | ¿A cuántas noches somos realmente más baratos? | `n_estrella_noches` | Serie | Gestión + prestadores | Segmentación del mensaje |
| P5 | ¿Cuándo hay que lanzar la campaña? | `l90_dias` | Curva de anticipación | Gestión | Calendario de pauta |
| P6 | ¿Cuánto vale pedir una frecuencia más? | `valor_marginal_frecuencia` | Número + derrame | Gestión | Negociación con Aerolíneas |
| P7 | ¿El sobreprecio aéreo tiene justificación? | `ipa_residual_pp`, `gap_competencia_pp` | Descomposición del gap | Provincia / ANAC | Escalamiento institucional |

Doce preguntas. Doce productos. Nada más, hasta que aparezca la pregunta trece **con
su decisión asociada**.

---

## 5. Capa 3 — Jerarquía de lectura en tres niveles

Esta es la respuesta concreta al "no queremos pestañas aisladas". El cruce no se logra
poniendo tres curvas en un gráfico: se logra con una **estructura narrativa** donde
cada nivel responde una pregunta distinta y baja al siguiente con el contexto puesto.

```
NIVEL 1 · TITULAR                      "¿Cómo venimos?"          15 segundos
  6 tarjetas con semáforo. Una sola pantalla, sin scroll.
  ┌──────────────┬──────────────┬──────────────┐
  │ Ocupación    │ Riesgo del   │ Brecha de    │
  │ proyectada   │ acuerdo COR  │ paquete      │
  │ 8 semanas    │ vs piso 80%  │ vs Bariloche │
  ├──────────────┼──────────────┼──────────────┤
  │ Fuga de      │ Alerta más   │ Cobertura    │
  │ puerta       │ severa       │ de datos     │
  └──────────────┴──────────────┴──────────────┘
                     │  clic
                     ▼
NIVEL 2 · DIAGNÓSTICO                  "¿Por qué?"               2 minutos
  Descomposición, comparación con el cluster, señal dominante,
  y la tarjeta de insight con su acción recomendada.
  Los filtros llegan YA APLICADOS desde el nivel 1.
                     │  clic
                     ▼
NIVEL 3 · EVIDENCIA                    "Mostrame el dato"        20 minutos
  Series completas, cross-filtering libre, tabla, cobertura por celda,
  descarga en CSV y enlace a la ficha metodológica del indicador.
```

Tres reglas que sostienen la estructura:

1. **El nivel 1 nunca crece.** Seis tarjetas. Agregar una exige sacar otra. Es lo único
   que evita la proliferación, porque la presión siempre es aditiva.
2. **Todo nivel 1 baja a un nivel 2 con el filtro puesto.** El cross-filtering de
   DuckDB-WASM está al servicio de la narrativa, no al revés.
3. **El nivel 3 es completo y aburrido a propósito.** Es donde se verifica, no donde se
   explora sin rumbo.

La tarjeta de cobertura en el nivel 1 no es relleno: es lo que hace que el resto sea
creíble. Un tablero que muestra su propia incertidumbre se usa para decidir; uno que
la esconde se usa una vez.

---

## 6. Capa 4 — Motor de insights declarativo

[`specs/catalogo/insights.yaml`](../specs/catalogo/insights.yaml) · 11 reglas.

El ETL las evalúa y emite `x_fact_insights.arrow`. **El tablero solo renderiza
tarjetas: no contiene una sola línea de lógica de diagnóstico.**

```yaml
- id: riesgo_fiscal_umbral
  severidad: alta
  requiere: [lf_proyectado_pct, exposicion_fiscal_ars, cobertura_captura_pct]
  cuando: "lf_proyectado_pct < 0.80 and lead_dias between 21 and 90"
  titular: "La ruta {ruta} proyecta {lf:.0%} de ocupación: {gap_pp:.0f} pp bajo el piso"
  cuerpo:  "Exposición estimada: {exposicion_fiscal_ars:,.0f} ARS. Quedan {lead_dias}
            días para vender {asientos_faltantes:.0f} asientos."
  accion:  "Promoción intensiva de la ruta. Cada asiento vendido sobre el piso es
            gasto público evitado."
  evidencia: [lf_proyectado_pct, exposicion_fiscal_ars, butacas_mes]
```

Por qué declarativo y no lógica dispersa en componentes:

* **Auditable.** Un tercero lee con qué criterio se afirmó cada cosa. Para un organismo
  público que va a discutir con Aerolíneas, esto no es opcional.
* **Versionado.** `git log` muestra cuándo se movió un umbral y con qué justificación.
* **Testeable.** Cada regla tiene casos sintéticos de resultado conocido.
* **Reutilizable.** La misma regla alimenta el tablero, el brief semanal y el correo de
  alerta. Sin duplicar lógica, que es de donde salen las contradicciones.
* **Degradación explícita.** Si falta un indicador de `requiere`, la regla **se omite y
  registra por qué**. No falla, y sobre todo no inventa.

El archivo cierra con una sección de **reglas que deliberadamente no existen** y su
motivo — "las tarifas subieron X%" (sin igualar anticipación no significa nada), "la
ocupación bajó" (es un hecho, no un insight), el dictamen categórico del informe
original. Documentar lo que se decidió no hacer evita que vuelva a proponerse cada seis
meses.

---

## 7. Capa 5 — Semáforo de confianza y reglas de publicación

Todo número del sistema lleva un grado, visible junto al dato:

| Grado | Significado | Fuente típica | ¿Sale del organismo? |
|---|---|---|---|
| **A · Oficial** | Dato de organismo público | ANAC/SIAC, EOH, OIT | Sí, citable |
| **B · Observado** | Medición propia con cobertura ≥ mínimo | Scraping, Métrica | Sí, como observación de mercado |
| **C · Modelado** | Estimación con supuestos | TTCI, elasticidad, proyecciones | Solo interno, o externo con banda e IC |
| **D · Insuficiente** | Bajo cobertura mínima | — | **No se muestra** |

Reglas asociadas, implementadas en el código generado:

* `esPublicable()` en TS y `es_publicable()` en Python devuelven verdadero solo para A y B.
* Bajo la cobertura mínima, la serie se marca preliminar y las alertas asociadas pasan a
  **"sin señal"** — nunca a verde.
* Los indicadores C se muestran siempre como **banda, no como punto**.
* Cada sección declara **hasta qué fecha llega cada fuente**: ANAC tiene 1–3 meses de
  rezago por diseño; el scraping, horas. Sin eso se leen como contemporáneas y se saca
  la conclusión equivocada.

Esto es lo que separa un observatorio de una planilla con gráficos: no la cantidad de
datos, sino **saber decir con cuánta certeza**.

---

## 8. Capa 6 — Productos de salida: el tablero no es el único

Acá es donde la información se vuelve producto. Un tablero es un lugar donde ir a
buscar; un producto **llega solo, en el momento en que hay que decidir algo**.

| Producto | Destinatario | Periodicidad | Decisión que dispara | Se genera desde |
|---|---|---|---|---|
| **Tablero** | Gestión, prestadores | Continuo | Exploración y verificación | Tablas oro |
| **Brief semanal de pauta** | Subsecretaría | Lunes | Dónde poner la pauta de la semana | Reglas P1, P5 |
| **Informe de renovación de ruta** | Provincia + Aerolíneas | Antes de cada vencimiento | **Renovar / ampliar / discontinuar el acuerdo** | R5, P2, P6 |
| **Alerta de riesgo fiscal** | Gestión + Hacienda | Por evento | Promoción intensiva o previsión presupuestaria | `riesgo_fiscal_umbral` |
| **Ficha de temporada** | Sector + público | Post-temporada | Rendición de cuentas y planificación | R1–R4 |
| **Paquete de evidencia** | ANAC, Transporte | A demanda | Escalamiento institucional | P7, R4 |

Los seis se generan del **mismo catálogo y las mismas reglas**. Un brief no es un
documento que alguien escribe interpretando el tablero: es una plantilla que se rellena
con los insights que dispararon esa semana. Si el tablero y el brief pudieran
contradecirse, ya perdimos.

**El más importante es el informe de renovación de ruta.** Tiene destinatario concreto,
fecha límite dada por el acuerdo y una decisión con plata asociada. Ver [`07`](07-conectividad-sostenible.md).

---

## 9. Capa 7 — Gobernanza por rol

Esquel Data ya tiene roles (`permisos.py`: admin, gestión, prestador, invitado). La
productivización exige decidir **qué ve cada uno** — no por secretismo, sino porque un
prestador y un funcionario de Hacienda necesitan cosas distintas, y mostrarle todo a
todos es otra forma de despelote.

| | Admin | Gestión | Prestador | Invitado / público |
|---|---|---|---|---|
| Tablero nivel 1–3 | ✓ | ✓ | Parcial | Solo A y B agregados |
| Exposición fiscal y riesgo de acuerdo | ✓ | ✓ | ✗ | ✗ |
| Benchmark de precios y pace OTA | ✓ | ✓ | ✓ | ✗ |
| Descomposición causal | ✓ | ✓ | Solo resultado | Resumen |
| Paquete de evidencia para lobby | ✓ | ✓ | ✗ | Al publicarse |
| Indicadores grado C | ✓ | ✓ con banda | ✗ | ✗ |
| Descarga de microdatos | ✓ | ✓ | Solo su destino | ✗ |
| Ficha metodológica | ✓ | ✓ | ✓ | ✓ |

La ficha metodológica es pública para todos, siempre. Es la contrapartida de restringir
lo demás: cualquiera puede auditar cómo se calcula, aunque no vea el número.

---

## 10. Regla de admisión y antipatrones

**Para que un indicador nuevo entre al sistema:**

1. Completa los 16 campos del catálogo. Si `decision` no se puede escribir, no entra.
2. Tiene una fila en el mapa de preguntas (§4) con un decisor con nombre.
3. Declara grado de confianza y cobertura mínima.
4. Tiene una prueba con caso sintético de resultado conocido.
5. Si va al nivel 1, **se indica qué tarjeta sale** para hacerle lugar.
6. Aparece en la ficha metodológica generada, sin edición manual.

**Antipatrones a rechazar en revisión:**

| Antipatrón | Por qué se rechaza |
|---|---|
| "Agreguemos también este gráfico, total ya tenemos el dato" | Proliferación. El costo no es calcularlo: es la atención que le quita al resto |
| Un número sin grado de confianza | Falsa precisión |
| Lógica de diagnóstico dentro de un componente React | Se vuelve inauditable y diverge del brief |
| Una métrica con el mismo nombre que otra y distinta definición | Ambigüedad semántica; el generador lo bloquea |
| Un insight sin acción | Ruido compitiendo por atención |
| Interpolar o rellenar huecos de captura | Convierte una ausencia de dato en un dato falso |
| Mostrar verde cuando no hay medición | La peor falla posible: el sistema miente por omisión |

---

## 11. Cómo se ve esto funcionando

Un lunes cualquiera, a las 8 de la mañana, sin que nadie abra el tablero:

> **Brief semanal · semana del 14 al 20 de septiembre**
>
> 🔴 **Riesgo fiscal.** La ruta COR–EQS proyecta 71% de ocupación para la semana del 9
> de octubre, 9 pp bajo el piso del acuerdo. Exposición estimada: $X. Quedan 24 días
> para vender 52 asientos. → *Promoción intensiva en Córdoba.*
>
> 🟠 **Paquete expulsivo.** El fin de semana largo del 12 de octubre está 41% más caro
> que Bariloche; el componente aéreo explica el 68%. → *Reasignar 40% de la pauta;
> mantener Buenos Aires con mensaje de paquete.*
>
> 🟡 **Ventana de pauta.** El 90% de las reservas de Tulipanes se toma con 47 días de
> anticipación. Quedan 12 días útiles. → *Ejecutar ahora.*
>
> ⚪ **Cobertura:** 94% aéreo · 97% OTA · ANAC hasta julio 2026.

Cuatro párrafos. Cada uno con un número, una acción y un plazo. Ese es el producto —
el tablero es lo que hay detrás para cuando alguien pregunte por qué.
