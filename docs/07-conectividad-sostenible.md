# 07 — El producto ancla: Conectividad Sostenible, riesgo fiscal y panel histórico

Este documento incorpora dos cosas que el informe original no tenía y que cambian la
prioridad del proyecto: el **marco contractual** bajo el que hoy opera la conectividad
de Esquel, y la **reconstrucción histórica 2017–2026** que permite medir su efecto.

También corrige la estimación de capacidad de `docs/00` H1, que estaba mal por un
factor de dos.

---

## 1. Corrección: la capacidad de Esquel

La revisión anterior tomó ~3 frecuencias semanales de una fuente de agregadores de
horarios. **El dato real es aproximadamente el doble**, y además no es constante:

| Período | Frecuencias semanales de llegada | Butacas/mes (E190 ≈96) |
|---|---|---|
| Base (todo el año) | 6 — diario salvo martes | ≈2.494 |
| Agosto–septiembre (+ COR–EQS) | 7 | ≈2.910 |
| Tulipanes (2 frecuencias diarias) | hasta 9 | ≈3.741 |

Consecuencias sobre lo dicho antes:

* **σ_aéreo se duplica** y, más importante, **es un perfil estacional, no un escalar**.
  El pico supera a la base en ~50%. Toda métrica de capacidad debe calcularse por mes.
* **La conclusión estratégica cambia de signo.** Con ~14% de cuota estructural, el canal
  aéreo era marginal y el subsistema valía sobre todo como instrumento de lobby. Con el
  doble, en meses de pico, el canal aéreo **es un canal de volumen** y el monitor de
  alerta temprana pasa a ser operativamente crítico, no solo argumentativo.
* La ruta COR–EQS no es una anécdota: es una **frecuencia adicional en el mes de mayor
  demanda**, negociada, y con un contrato detrás.

Lección metodológica que conviene incorporar al sistema: **las fuentes de terceros sobre
horarios son poco confiables** — para la misma ruta y el mismo mes se encontraron cifras
de 3, 4, 6 y 27 frecuencias semanales según el agregador. La frecuencia se toma de ANAC
(operado real) y del scraping (programado), nunca de agregadores. Y el catálogo debe
admitir **corrección manual verificada localmente**: los parámetros estructurales llevan
un campo `verificado_por` y `fecha_verificacion`, porque el equipo del OIT sabe cosas que
ninguna fuente publica bien.

---

## 2. El programa de Conectividad Sostenible: el producto ancla

La ruta Córdoba–Esquel opera bajo el **programa de Conectividad Sostenible** de
Aerolíneas Argentinas: acuerdos bilaterales con provincias o municipios para sostener
rutas que por baja demanda o estacionalidad no alcanzan por sí solas el umbral de
rentabilidad. La cláusula central, según lo publicado:

> **Si la ocupación del vuelo no alcanza el 80%, la jurisdicción cubre la diferencia con
> fondos públicos.**

Esto reordena el proyecto entero, por cuatro razones:

**a) Hay un umbral duro, y no es estadístico.** El 80% no es un percentil ni una
convención de alerta: es el punto en el que empieza a salir plata del erario provincial.
Todo el monitor de alerta temprana debería estar anclado a ese número para la ruta bajo
acuerdo.

**b) Cada punto de ocupación tiene precio.** Eso convierte el observatorio de un
generador de insights en un **instrumento de gestión de riesgo fiscal**:

$$\text{Exposición} = \max(0,\ 0{,}80 - LF_{\text{proyectado}}) \times \text{butacas del período} \times \text{tarifa de referencia}$$

Y le da retorno medible a la pauta publicitaria, que hasta ahora era un acto de fe:
**gastar $X en promoción para no pagar $Y de subsidio es una comparación que se puede
hacer.** Ninguna otra métrica del sistema tiene esa propiedad.

**c) Hay un interlocutor, un mecanismo y una fecha.** El acuerdo se renueva. La decisión
de renovarlo, ampliarlo o discontinuarlo necesita evidencia, y hoy esa evidencia no
existe de forma sistemática. Ese es el hueco que el observatorio llena mejor que nadie.

**d) Hay un precedente favorable.** El invierno 2025 de la ruta COR–EQS cerró con
ocupación superior al 85% — por encima del piso, es decir sin costo fiscal, y con
argumento para renovar. Ese es exactamente el tipo de resultado que hay que poder
demostrar con dato oficial y anticipar con dato propio.

### 2.1 Tablero de riesgo de acuerdo

Producto concreto, una sola pantalla por ruta bajo acuerdo:

```
RUTA COR–EQS · Acuerdo temporada de nieve 2026 · piso contractual 80%

  LF proyectado         ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░  71%    ⚠ 9 pp bajo el piso
  Piso contractual      ────────────────────  80%
  LF mismo período 2025 ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░  85%    ✓

  Asientos por vender para alcanzar el piso ....... 52
  Días hábiles restantes .......................... 24
  Exposición fiscal estimada ...................... $ ____
  Costo de la pauta necesaria (estimado) .......... $ ____
  Relación evitar/gastar .......................... __ x

  → Acción: promoción dirigida en Córdoba, segmento familias, salidas de jueves.
```

Los dos últimos renglones son el producto. Todo lo demás es el camino hasta ahí.

### 2.2 Cómo se proyecta el LF

Sin historia propia de scraping, el arranque es transversal y se refina por fases:

| Fase | Insumo | Método |
|---|---|---|
| **0** — desde hoy | ANAC del mismo período del año anterior | Punto de partida: LF histórico de la ruta, ajustado por variación de butacas |
| **1** — 3 meses | + pace de tarifas propio | La velocidad a la que sube la tarifa mediana es proxy del ritmo de venta: si a T-30 la tarifa no despegó, el avión está vacío |
| **2** — 12 meses | + calibración contra LF observado | Regresión de LF real sobre pace de tarifa a igual anticipación. Es estimable con pocas decenas de casos porque la relación es fuerte |

La fase 1 merece subrayarse porque es contraintuitiva y barata: **la curva de precios es
un sensor de ocupación**. En revenue management la tarifa sube al agotarse las clases
bajas, de modo que una tarifa plana a 30 días es señal de avión vacío. No hace falta ver
el inventario para inferirlo, y se puede calibrar contra el LF real que publica ANAC.

---

## 3. Panel histórico 2017–2026

ANAC/SIAC publica desde 2017 con grano diario por par origen-destino. Cruzado con la
historia del OIT y de EOH da un panel de ~100 meses × 8–10 destinos que **no requiere
scrapear nada** y se puede construir en la primera semana.

### 3.1 Estructura

`hist_fact_mes` — grano `(mes, destino)`:

| Bloque | Columnas | Fuente | Desde |
|---|---|---|---|
| Conectividad | `vuelos`, `butacas`, `pax_aereos`, `lf_real` | ANAC/SIAC | 2017 |
| Demanda local | `ocupacion_oit_pct`, `pernoctes`, `estadia_media`, `derrame` | OIT | según historia disponible |
| Contexto regional | `ocupacion_eoh_pct` por región | EOH/INDEC | 2004 |
| Mercado | `adr_med_ars`, `ocupacion_implicita_pct` | Métrica | inicio de Métrica |

≈1.000 filas. Trivial de emitir y de consultar.

### 3.2 Qué se responde de inmediato, sin esperar nada

1. **σ_aéreo real y su estacionalidad**, con butacas reales en vez de supuestos.
2. **Multiplicador pernoctes por pasajero aéreo** y su estabilidad. Traduce
   empíricamente conectividad en demanda, y reemplaza el supuesto de estadía media.
3. **Elasticidad de la ocupación a las butacas ofrecidas**, con ~100 meses y efectos
   fijos de destino y mes. Esta sí es estimable hoy.
4. **Serie de LF por ruta** contra el piso del 80%: cuántas veces se habría activado la
   cláusula, históricamente.
5. **Estacionalidad de la demanda aérea** de Esquel contra la del cluster: ¿el pico de
   Tulipanes se refleja en el aire o es tráfico terrestre?

Los puntos 1–3 resuelven el arranque en frío que `docs/00` H8 planteaba como limitación
de doce meses. **Con ANAC, la parte de capacidad del modelo arranca calibrada.**

---

## 4. Diseño cuasi-experimental: cuánto aporta realmente una ruta

Este es el hallazgo metodológico más fuerte de esta ronda.

El programa de Conectividad Sostenible **agrega y quita rutas por decisión
político-contractual**, no por demanda observada del mes. Eso genera variación de oferta
razonablemente exógena, que es justo lo que falta en los datos de precios (donde precio
y demanda se determinan juntos, `docs/02` §6).

**Unidades tratadas identificables** en el programa, todas con serie ANAC desde 2017:

| Ruta | Naturaleza del tratamiento |
|---|---|
| COR–EQS | Estacional, activada en 2025 y 2026 — **dos episodios** |
| BUE–Viedma | Ampliación de dosis: 4 → 6 frecuencias semanales |
| BUE–Río Cuarto | Alta de ruta |
| Merlo (San Luis) | Estacional convertida en anual |
| Reconquista | Alta y baja (2023–2024) — **incluye la baja, que es informativa** |
| COR–Posadas | Alta de ruta |

**Grupo de control:** destinos comparables sin cambios de oferta en el mismo período.

**Estimación:** estudio de eventos con efectos fijos de ruta y de mes,

$$y_{jt} = \alpha_j + \gamma_t + \sum_{k \neq -1} \beta_k \cdot D_{jt}^{(k)} + \varepsilon_{jt}$$

donde $D^{(k)}$ marca $k$ meses desde la activación de la ruta e $y$ es pernoctes,
ocupación o pasajeros aéreos del destino. Los $\beta_k$ con $k<0$ son la **prueba de
tendencias paralelas**: si no son planos, el diseño no se sostiene y hay que decirlo.

**Advertencias, que van en el informe y no en una nota al pie:**

* La asignación no es aleatoria: las rutas se agregan donde se espera demanda. Eso sesga
  el efecto **hacia arriba**. Se reporta como cota superior.
* Con adopción escalonada, la estimación por efectos fijos bidireccionales tiene sesgo
  conocido. Con este número de unidades conviene el estudio de eventos contra
  no-tratados, no el promedio de dos vías.
* Se reporta el gráfico de evento completo, no un número suelto. El lector tiene que
  poder ver la ausencia de tendencia previa con sus propios ojos.

**Para qué sirve.** Contesta con evidencia la pregunta que hoy se responde con
intuición: *¿cuántos pernoctes y cuánto derrame genera realmente una frecuencia nueva?*
Es el corazón del informe de renovación, y sirve tanto para pedir la ruta como para
justificar el aporte provincial si hiciera falta. Es, además, un trabajo publicable:
ningún observatorio provincial argentino tiene esto hecho.

---

## 5. Informe de renovación de ruta

El producto de mayor valor del sistema. Se genera automáticamente antes de cada
vencimiento de acuerdo.

| Sección | Contenido | Origen |
|---|---|---|
| 1. Desempeño | LF observado por semana contra el piso del 80% | ANAC + scraping |
| 2. Costo fiscal efectivo | Aporte realmente devengado, si hubo | ANAC + acuerdo |
| 3. Impacto en demanda | Pernoctes y derrame atribuibles, con IC | Estudio de eventos (§4) |
| 4. Retorno | Derrame generado sobre aporte público | 2 y 3 |
| 5. Perfil del pasajero | Origen, estadía, gasto | OIT |
| 6. Proyección | LF esperado del próximo período, con banda | §2.2 |
| 7. Recomendación | Renovar / ampliar / ajustar frecuencias / discontinuar | Reglas |

Un informe de siete secciones, con números, que hoy no existe y que la provincia
necesita para decidir. Ese es el estándar de "productivizar": no un tablero lindo, sino
**un documento con destinatario, fecha y decisión asociada.**

---

## 6. Consecuencia sobre las prioridades: la regla de perecibilidad

> **El dato de precios es perecedero. El de ANAC no.**

La tarifa de hoy para el 12 de octubre no se puede recuperar mañana: si no se capturó,
se perdió para siempre. ANAC, en cambio, se puede backfillear completo desde 2017 en
cualquier momento.

Y como las decisiones de compra se definen en una ventana de ~3 meses, **cada día sin
captura es un día de curva de anticipación que nunca se va a tener**. Para la temporada
de verano, la ventana ya está corriendo.

Esto reordena el plan de `docs/04`:

| Antes | Ahora |
|---|---|
| F0 completo → F1 colector | **F1a colector mínimo arranca en paralelo con F0** |
| ANAC en F2b | ANAC + panel histórico en F1b, sin urgencia — es backfilleable |

**F1a — colector mínimo (2 días, empieza a acumular ya):**
solo rutas T1 y T2, solo el conjunto de fechas ancla, escritura a JSONL, sin
compactación, sin dashboard, sin modelos. El objetivo no es que esté bien terminado:
es que **empiece a existir el histórico**. La calidad se mejora después reprocesando
desde bronce — que es exactamente para lo que existe la capa bronce.

Lo único que F1a necesita del spike es F0-1 (¿aparecen las low-cost?) y F0-3 (¿la IP
aguanta?). Ambas se resuelven en horas. El resto de F0 puede correr en paralelo.

Prioridad revisada:

```
Semana 1   F0-1, F0-3  →  F1a colector mínimo EN PRODUCCIÓN acumulando
           F0-4..F0-8 en paralelo
Semana 2   Panel histórico ANAC+OIT (§3) → primeras respuestas reales sin scraping
Semana 3   Catálogo y capa semántica (docs/06) → antes de construir vistas
Semana 4+  F1b colector completo, F2 contrato Métrica, F3 tablas oro
```

Las semanas 2 y 3 producen valor entregable sin depender de que el colector madure. Y
el catálogo va **antes** que las vistas, deliberadamente: definir los nombres después de
haber construido las pantallas es cómo se llega al despelote que hay que evitar.

---

## Fuentes consultadas

- [Aerolíneas Argentinas operará la ruta Córdoba–Esquel bajo el programa de Conectividad Sostenible](https://dailyweb.com.ar/noticias/val/54573/aerolineas-argentinas-operara-la-ruta-cordobaesquel-durante-la-temporada-de-nieve.html)
- [Conectividad Sustentable: el programa para mantener operativas las rutas no rentables — AAACI](https://aaaci.org.ar/conectividad-sustentable-el-programa-de-aerolineas-argentinas-para-mantener-operativas-las-rutas-no-rentables/)
- [Aerolíneas Argentinas encontró la vuelta para mantener rutas con poca demanda — Aviacionline](https://www.aviacionline.com/aerolineas-argentinas-encontro-la-vuelta-para-mantener-rutas-con-poca-demanda)
- [Vuelven los vuelos directos entre Córdoba y Esquel para la temporada de invierno](https://www.diariouno.com.ar/nieve/vuelven-los-vuelos-directos-cordoba-y-esquel-la-temporada-invierno-n1563615)
- [Aterrizó en Esquel el primer vuelo Córdoba–Esquel de la temporada 2026 — EQS Notas](https://www.eqsnotas.com/turismo/aterrizo-en-esquel-el-primer-vuelo-cordoba-esquel-de-la-temporada-de-invierno-2026_a6a7495c3dba7904ff6671315)
- [Aerolíneas suma frecuencias a Viedma mediante Conectividad Sostenible](https://aviacionenargentina.com.ar/aerolineas-argentinas-con-el-programa-de-conectividad-sostenible-suma-vuelos-a-viedma-y-potencia-el-modo-federal/)
- [Datos Abiertos de Turismo — Conectividad Aérea (ANAC/SIAC)](https://datos.yvera.gob.ar/dataset/conectividad-aerea)
