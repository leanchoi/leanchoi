# 02 — Modelo analítico: correlación, atribución y alerta temprana

Responde el punto 2 del pedido. Corrige las formulaciones del informe original (H4, H7, H8, H10) y
agrega los indicadores que se derivan de la estructura real del mercado aéreo de Esquel (H1).

---

## 1. Notación

| Símbolo | Significado | Fuente |
|---|---|---|
| $o$ | Origen emisor (`BUE`, `COR`) | — |
| $d$ | Destino (`EQS`, `BRC`, `CPC`, …) | — |
| $g$ | **Puerta de entrada aérea** usada para llegar a $d$ (puede ser $\neq d$) | — |
| $t$ | Fecha de inicio de estadía (check-in) | — |
| $\tau$ | Fecha de observación | — |
| $\ell = t - \tau$ | **Anticipación** (lead time), en días | — |
| $P$ | Pasajeros del grupo | Parámetro de UI |
| $N$ | Noches de estadía | Parámetro de UI |
| $c$ | Ocupación por unidad de alojamiento | Parámetro (2 hab. / 4 cabaña) |
| $u = \lceil P/c \rceil$ | Unidades de alojamiento necesarias | Derivado |
| $F_{og}(t,\ell)$ | Tarifa aérea **ida y vuelta, por pasajero**, mediana de celda | Métrica Aéreos |
| $A_d(t,\ell)$ | ADR **por unidad-noche** | Métrica (Booking/Airbnb) |
| $G_{g \to d}(P)$ | Costo de traslado terrestre puerta→destino, ida y vuelta, para el grupo | Tabla paramétrica |
| $S_d$ | Butacas ofrecidas por semana | ANAC/SIAC |
| $LF_d$ | Factor de ocupación aéreo real | ANAC/SIAC |
| $O_d$ | Ocupación hotelera | OIT / Métrica / EOH |
| $\eta$ | Elasticidad ocupación–costo total | Estimada (§8) |

Regla transversal, derivada de H7: **toda comparación se hace dentro de celda**
$(ruta \times \ell\text{-bucket} \times \text{día de semana} \times \text{temporada})$. Comparar
observaciones con anticipaciones distintas no mide competitividad, mide el paso del tiempo.

---

## 2. Índice de Costo Total de Viaje (TTCI)

### 2.1 Formulación corregida

El TTCI del informe suma una magnitud *por pasajero* (el pasaje) con una *por unidad de alojamiento*
(el ADR). La forma correcta separa ambos escalados:

$$\text{TTCI}_{o \to d}^{(g)}(t,\ell,P,N) \;=\; \underbrace{P \cdot F_{og}(t,\ell)}_{\text{aéreo}} \;+\; \underbrace{G_{g \to d}(P)}_{\text{traslado}} \;+\; \underbrace{N \cdot \lceil P/c \rceil \cdot A_d(t,\ell)}_{\text{alojamiento}}$$

Normalización obligatoria para que las comparaciones sean legibles:

$$\text{ttci}^{pppn} \;=\; \frac{\text{TTCI}}{P \cdot N} \qquad \text{(costo por persona y por noche)}$$

Pesos de cada componente, que se usan más adelante en la descomposición causal:

$$w_A = \frac{P \cdot F_{og} + G_{g \to d}}{\text{TTCI}}, \qquad w_L = 1 - w_A$$

**Por qué importa la corrección.** $w_A$ crece con $P$ y decrece con $N$. Con los números del propio
informe, la brecha Esquel–Bariloche pasa de 22% (grupo de 1) a 54% (grupo de 4). El informe
subestima el problema justo en el segmento de familias, que es el que define la temporada de un
destino de naturaleza.

### 2.2 Variantes por puerta de entrada, y el Índice de Fuga

Esta es una omisión importante del informe original. Un turista que quiere ir a Esquel **no está
obligado a volar a Esquel**. Puede volar a Bariloche —mercado competitivo con tres operadores— y
recorrer ~290 km por tierra. Ese arbitraje ya ocurre y hoy es invisible para el observatorio.

Se calcula el TTCI de Esquel para cada puerta de entrada posible:

| Puerta $g$ | Traslado a Esquel | Comentario |
|---|---|---|
| `EQS` | 0 km | Directo, monopolio AR |
| `BRC` | ≈290 km | **Mercado competitivo: AR + Flybondi + JetSMART** |
| `REL` / `PMY` | ≈600 km | Vía costa; relevante en temporada alta atlántica |
| `CRD` | ≈600 km | Nodo corporativo provincial |

$$\text{Puerta óptima:} \quad g^{\*}(t,\ell,P,N) = \arg\min_{g} \; \text{TTCI}^{(g)}_{\text{Esquel}}$$

$$\textbf{Índice de Fuga de Puerta de Entrada} \quad \text{IFPE} = \frac{\#\{t : g^{\*}(t) \neq \text{EQS}\}}{\#\{t\}}$$

Interpretación y uso:

* **IFPE alto** significa que el aeropuerto de Esquel está siendo económicamente esquivado por sus
  propios visitantes. Es un dato durísimo para presentar ante Aerolíneas y ante ANAC: la ruta no
  tiene poca demanda, tiene demanda que se va por otra puerta.
* Es **accionable de inmediato y sin depender de nadie**: si la fuga vía Bariloche es sistemática,
  la política correcta no es solo reclamar tarifas, es **industrializar el corredor BRC–Esquel**
  (transfers regulares, acuerdos con rentadoras, paquetes con traslado incluido). Convierte un
  problema en un canal.
* La magnitud $\text{TTCI}^{(EQS)} - \text{TTCI}^{(BRC)}$ es, literalmente, el sobreprecio que paga
  quien insiste en volar a Esquel.

### 2.3 Umbral de estadía compensatoria $N^{\*}$

El indicador más accionable que se deriva de la corrección de H4. Pregunta: *si el alojamiento en
Esquel es más barato que en Bariloche, ¿a partir de cuántas noches esa ventaja compensa el
sobreprecio aéreo?* Igualando ambos TTCI y despejando $N$:

$$N^{\*} \;=\; \frac{P\,\big[(F_{o,EQS} + G_{EQS}) - (F_{o,BRC} + G_{BRC})\big]}{\lceil P/c \rceil \cdot \big(A_{BRC} - A_{EQS}\big)}$$

Lectura operativa:

| Caso | Significado | Acción |
|---|---|---|
| $A_{BRC} \le A_{EQS}$ | Bariloche domina en ambos componentes | Esquel no compite por precio a ninguna duración. Reposicionar por producto, no por costo |
| $N^{\*} > $ estadía media real | La ventaja hotelera **nunca se materializa** en la práctica | Segmentar marketing a estadías largas; el mensaje de "más barato" es falso para el turista típico |
| $N^{\*} \le $ estadía media real | Esquel es efectivamente más barato para el viaje típico | El problema no es de costo total: revisar notoriedad, producto o accesibilidad de la información |

Graficar $N^{\*}$ como serie temporal por fecha objetivo es más informativo que cualquier tabla de
tarifas: muestra en un solo trazo si la competitividad de Esquel mejora o se deteriora.

### 2.4 Descuento hotelero requerido e Índice de Compensabilidad

La contracara, y la defensa del sector hotelero local frente a la acusación implícita de "estar
caros". Fijado $N$, ¿qué ADR debería tener Esquel para igualar el paquete de Bariloche?

$$A_{EQS}^{req}(N) \;=\; A_{BRC} \;-\; \frac{P\,\big[(F_{o,EQS}+G_{EQS}) - (F_{o,BRC}+G_{BRC})\big]}{N \cdot \lceil P/c \rceil}$$

$$\textbf{Índice de Compensabilidad} \quad \text{IC} = \frac{A_{EQS}^{req}(N)}{A_{EQS}^{obs}}$$

* $\text{IC} \ge 1$: el ajuste hotelero puede cerrar la brecha.
* $\text{IC} < 1$: el alojamiento local debería bajar su precio hasta $A^{req}$ para compensar.
* $A_{EQS}^{req} < $ costo variable de operación: **compensación imposible**. Es evidencia formal y
  cuantificada de que el diferencial no es atribuible al sector hotelero local. Este es exactamente
  el argumento que el informe quiere sostener, expresado de una forma que resiste una auditoría.

---

## 3. Paridad aérea: del ratio descriptivo al residual explicado

### 3.1 Por qué el ratio tarifa/km del informe no alcanza

$$\text{tarifa/km}_d = \frac{F_{o \to d}}{\text{dist}_{o \to d}}, \qquad \text{Ratio}_{EQS/BRC} = \frac{\text{tarifa/km}_{EQS}}{\text{tarifa/km}_{BRC}}$$

Se conserva **como indicador descriptivo y comunicable** —es intuitivo y funciona en una
presentación—, pero no sirve como evidencia técnica, por dos razones:

1. **La estructura de costos aéreos no es lineal en la distancia.** Hay un componente fijo grande
   (tasas, rotación, tripulación) que se amortiza sobre menos kilómetros en rutas cortas. Toda ruta
   corta tiene tarifa/km alta *por construcción*.
2. **Omite la variable que realmente manda:** la competencia. Y en este caso la omisión es total,
   porque EQS tiene un operador y BRC tiene tres (H1).

Además, la aritmética desarma la hipótesis geográfica: sobre coordenadas semilla, AEP–EQS ≈ 1.439 km
y AEP–BRC ≈ 1.335 km. **Esquel está apenas 7,8% más lejos que Bariloche.** La distancia no puede
explicar una brecha tarifaria de dos dígitos altos o de tres.

### 3.2 Modelo hedónico de tarifa y descomposición del gap

Con las rutas T4 de "combustible de regresión" (`docs/01` §4.1) se estima sobre el conjunto de rutas
domésticas:

$$\ln F_{j,\ell,m} = \beta_0 + \beta_1 \ln \text{dist}_j + \beta_2 \ln(1 + n_j) + \beta_3 \ln \text{freq}_j + f(\ell) + \gamma_m + \delta_{\text{aerolínea}} + \varepsilon_{j,\ell,m}$$

donde $n_j$ = operadores en la ruta, $\text{freq}_j$ = frecuencias semanales, $f(\ell)$ = spline o
dummies de bucket de anticipación, $\gamma_m$ = efecto fijo de mes.

El gap observado se descompone en contribuciones aditivas en logaritmos:

$$\ln\frac{F_{EQS}}{F_{BRC}} = \underbrace{\beta_1 \ln\frac{\text{dist}_{EQS}}{\text{dist}_{BRC}}}_{\text{distancia}} + \underbrace{\beta_2 \ln\frac{1+n_{EQS}}{1+n_{BRC}}}_{\text{competencia}} + \underbrace{\beta_3 \ln\frac{\text{freq}_{EQS}}{\text{freq}_{BRC}}}_{\text{escala/frecuencia}} + \underbrace{(\bar\varepsilon_{EQS} - \bar\varepsilon_{BRC})}_{\text{residual no explicado}}$$

**Salida del tablero** (ejemplo con coeficientes ilustrativos, **no estimados** — sirve para mostrar
el formato del resultado, no para citarlo):

> Del +180% de brecha tarifaria EQS vs BRC: **+4 pp** se explican por distancia, **+27 pp** por falta
> de competencia, **+57 pp** por escala de frecuencias, y **+92 pp permanecen sin explicar**
> (IC 95%: +71 a +113 pp).

Esa frase, con coeficientes reales, es el producto de mayor valor político de todo el sistema. Y es
mucho más sólida que un ratio, porque **concede explícitamente lo que sí tiene explicación
estructural** —lo que la vuelve difícil de refutar en el punto que importa—.

Notas de implementación:

* Basta `numpy.linalg.lstsq` con dummies; no hace falta `statsmodels`. Intervalos por bootstrap de
  bloques por ruta (500 réplicas).
* Requiere ≥15 rutas y ≥6 meses de historia. Antes de eso, el tablero muestra solo el ratio
  descriptivo, etiquetado como tal.
* Reportar siempre $R^2$ y número de rutas. Un modelo con pocas rutas monopólicas no puede separar
  bien $\beta_2$ de $\beta_3$; conviene reportar competencia y frecuencia **como un bloque conjunto**
  cuando su correlación supere 0,8.

---

## 4. Capacidad: los indicadores que realmente gobiernan Esquel

Consecuencia directa de H1 y la contribución que más cambia las prioridades del proyecto.

### 4.1 Suficiencia aérea relativa

$$\text{ISA}_d = \frac{\text{butacas mensuales llegadas a } d}{\text{plazas hoteleras} \times \text{días del mes}} \times 1000$$

Butacas de ANAC/SIAC (dato oficial), plazas hoteleras del ETL del OIT. Comparar `ISA_EQS` con
`ISA_BRC`, `ISA_CPC`, `ISA_FTE`. Mide cuánta cama hay por cada asiento de avión disponible: es la
forma más limpia de mostrar un desbalance estructural entre inversión hotelera local y conectividad.

### 4.2 Techo estructural del canal aéreo

$$\text{pernoctes}^{\max}_{\text{aéreo}} = \underbrace{S_d \cdot 4{,}33}_{\text{butacas/mes}} \cdot LF^{\max} \cdot \bar{N}_{\text{aéreo}}$$

$$\textbf{Cuota estructural máxima} \quad \sigma_{\text{aéreo}} = \frac{\text{pernoctes}^{\max}_{\text{aéreo}}}{\text{pernoctes totales del mes}}$$

Orden de magnitud para Esquel, con parámetros a confirmar contra ANAC:
3 frecuencias/semana × ≈96 butacas × 4,33 ≈ **1.250 butacas/mes**; con $LF^{\max}=0{,}90$ y
$\bar N = 4$ noches → **≈4.500 pernoctes/mes como techo absoluto**.

**Este número, dividido por los pernoctes totales que ya conoce el OIT, es el cálculo más importante
del proyecto** y se puede hacer hoy, sin construir nada (prueba F0-8). Determina el encuadre:

* Si $\sigma_{\text{aéreo}}$ es baja: el canal aéreo no puede mover la aguja de la ocupación aunque
  todo salga bien. La pauta debe ser mayoritariamente terrestre **de manera permanente**, no como
  reacción a alertas, y el subsistema aéreo vale sobre todo como **instrumento de evidencia para
  gestión y lobby**. Sigue valiendo la pena construirlo — pero se prioriza distinto y se comunica
  distinto.
* Si es alta: el aéreo sí es un canal de volumen y el monitor de alerta temprana pasa a ser
  operativamente crítico.

### 4.3 Valor marginal de una frecuencia

$$\Delta\text{pernoctes/mes por frecuencia semanal} = \text{asientos} \times 4{,}33 \times LF \times \bar{N}$$

Con 96 asientos, $LF=0{,}85$, $\bar N = 4$: **≈1.410 pernoctes/mes por cada frecuencia semanal
agregada**. Multiplicado por el gasto diario per cápita que ya estima `demanda.py`, se obtiene el
**derrame económico mensual por frecuencia**.

Es la cifra que hay que llevar a cualquier reunión con Aerolíneas, ANAC o la Secretaría de
Transporte: convierte un pedido ("queremos más vuelos") en una propuesta cuantificada de impacto
económico regional.

---

## 5. Curvas cruzadas de anticipación

### 5.1 Grano del cubo

Grano: $(\text{destino}, t, \ell\text{-bucket})$, con buckets
$\{0\text{–}2, 3\text{–}6, 7\text{–}13, 14\text{–}20, 21\text{–}29, 30\text{–}44, 45\text{–}59, 60\text{–}89, 90\text{–}119, 120+\}$.
Diez buckets reducen el volumen ~30× frente al grano diario sin perder forma de curva (ver
presupuesto de bytes en `docs/03` §5).

Tres series sincronizadas sobre el eje $\ell$ para una fecha objetivo $t$:

1. $F_{BUE \to EQS}(t,\ell)$ — tarifa mediana, con banda intercuartil.
2. $A_{EQS}(t,\ell)$ — ADR mediano de Esquel en OTA.
3. $B_{EQS}(t,\ell)$ — proporción reservada, derivada de disponibilidad.

### 5.2 Punto de congelamiento

$$B(\ell) = 1 - \frac{\text{disponibilidad}(\ell)}{\text{disponibilidad}(\ell_{\max})}$$

$$\ell_{90} = \min\{\ell : B(\ell) \ge 0{,}90 \cdot B(0)\}$$

$\ell_{90}$ es **la anticipación a la que ya está decidido el 90% de la temporada**. Es el dato
operativo que fija el calendario de pauta: cualquier campaña lanzada después de $\ell_{90}$ llega
tarde por definición. Ninguna otra fuente disponible hoy en Esquel puede calcularlo.

### 5.3 Acoplamiento aéreo–hotelero

La pregunta del informe —*si el vuelo agota su tarifa baja en $T-45$, ¿las reservas hoteleras se
aplanan enseguida?*— se responde con correlación cruzada rezagada sobre el conjunto de fechas ancla:

$$\rho(k) = \operatorname{corr}\Big( \Delta \ln F(t, \ell), \; \Delta B(t, \ell + k) \Big), \quad k \in [-14, +14]$$

El $k^{\*}$ que maximiza $|\rho|$ estima el **rezago de transmisión** del shock aéreo al mercado
hotelero. Con ~87 fechas ancla al año y muestreo denso en $T-45\ldots T-1$, es estimable tras una
temporada. Un $\rho$ alto con $k^{\*}$ pequeño y positivo es la evidencia más directa de causalidad
aéreo → alojamiento que este sistema puede producir.

---

## 6. Elasticidad: qué se puede y qué no se puede afirmar

Advertencia metodológica que el informe omite y que conviene escribir antes de que alguien cite un
número: **los precios suben cuando la demanda sube**. Una regresión ingenua de ocupación contra
precio está contaminada por simultaneidad y sesga $\eta$ hacia cero, es decir, hace parecer que el
precio importa menos de lo que importa.

**Especificación recomendada** (panel con efectos fijos, sobre los 10 destinos de Métrica):

$$\ln O_{d,m} = \alpha_d + \gamma_m + \eta \ln \text{TTCI}_{d,m} + u_{d,m}$$

$\alpha_d$ absorbe atractivo permanente del destino; $\gamma_m$ absorbe shocks macro y estacionales
comunes. $\eta$ queda identificada por variación **relativa** entre destinos dentro de cada mes, lo
que mitiga —sin eliminar— la endogeneidad, porque los shocks comunes de demanda se cancelan.

**Requisitos mínimos:** ≥24 meses × ≥6 destinos. Antes de alcanzarlos:

| Etapa | Qué usar | Cómo se muestra en el tablero |
|---|---|---|
| Meses 0–24 | Banda a priori $\eta \in [-1{,}3,\ -0{,}6]$ (rango habitual para turismo doméstico de ocio) | **Banda, nunca un punto.** Todo resultado derivado se muestra como rango |
| Mes 24+ | $\hat\eta$ estimada con IC | Punto + IC, con nota metodológica |

Y una regla editorial: se reporta **asociación**, no causalidad. "Los meses en que el TTCI relativo
de Esquel fue 10% mayor, la ocupación fue en promedio X% menor" es defendible. "Subir el TTCI 10%
causa X% menos ocupación" no lo es con estos datos.

---

## 7. Descomposición del desvío de ocupación (retrospectivo)

Reemplaza el "dictamen automatizado" del informe (H10). Todo en logaritmos, comparación interanual
para eliminar estacionalidad. Sea $y_{d,m} = \ln O_{d,m}$ y $\Delta y_d = y_{d,m} - y_{d,m-12}$.

**Paso 1 — Factor regional común.** Con el cluster de benchmark $\mathcal{B}$ (Bariloche, SMA, El
Bolsón, Villa La Angostura, …), pesos $\omega_b$ por similitud de perfil (inicialmente uniformes;
alternativa: serie EOH regional):

$$R_m = \sum_{b \in \mathcal{B}} \omega_b \, \Delta y_b$$

**Paso 2 — Desvío local.** Lo que le pasó a Esquel y no al resto:

$$L_m = \Delta y_{EQS} - R_m$$

**Paso 3 — Componente de precio, separado en aéreo y hotelero.** Usando la aproximación de primer
orden $\Delta \ln \text{TTCI} \approx w_A \Delta \ln(\text{aéreo}) + w_L \Delta \ln(\text{alojamiento})$
y la elasticidad de §6:

$$\text{efecto}_{\text{aéreo}} = \hat\eta \cdot w_A \cdot \Delta \ln\!\frac{F_{EQS}}{F_{ref}}, \qquad \text{efecto}_{\text{hotel}} = \hat\eta \cdot w_L \cdot \Delta \ln\!\frac{A_{EQS}}{A_{ref}}$$

**Paso 4 — Componente de capacidad (mecánico, no elástico).** Solo aplica si la restricción era
activa:

$$\text{efecto}_{\text{cap}} = \begin{cases} \sigma_{\text{aéreo}} \cdot \Delta \ln S_{EQS} & \text{si } \Delta \ln S_{EQS} < 0 \ \text{ y } \ LF_{m-12} \ge 0{,}85 \\[4pt] 0 & \text{en otro caso} \end{cases}$$

La condición sobre $LF$ es esencial: **perder plazas solo resta pernoctes si los aviones venían
llenos.** Si el factor de ocupación era 0,60, recortar frecuencias no explica nada y atribuirle el
desvío sería un error.

**Paso 5 — Residuo, explícito y nombrado.**

$$\text{Residuo} = L_m - \text{efecto}_{\text{aéreo}} - \text{efecto}_{\text{hotel}} - \text{efecto}_{\text{cap}}$$

**Salida del tablero:** barra apilada en puntos porcentuales.

> **Invierno 2026, ocupación −18 pp interanual.** Factor regional −7 pp · Capacidad aérea −5 pp ·
> Tarifa aérea relativa −3 pp · Ventaja de precio hotelero **+1 pp** · **Sin explicar −4 pp.**
> *Rango según banda de elasticidad: aéreo entre −2 y −5 pp.*

**Gates de suficiencia** (coherentes con las reglas de mínimos muestrales de `indicadores.py`). Si
alguno falla, el tablero muestra *"evidencia insuficiente"* en lugar de una barra:

1. Cobertura de captura aérea ≥80% en el período, en Esquel y en el cluster.
2. Al menos 4 destinos del benchmark con dato completo.
3. Mínimos muestrales de Métrica cumplidos para el ADR de cada destino usado.
4. Ancho de la banda de $\hat\eta$ tal que el signo de cada componente sea estable en todo el rango.

Un observatorio que sabe decir *no sé* es el que puede ser creído cuando dice *sé*. Esa es la
diferencia entre esta descomposición y el dictamen categórico del informe.

---

## 8. Monitor de Alerta Temprana

### 8.1 Principios de diseño

Cuatro reglas, cada una corrigiendo un modo de fallo concreto:

1. **Comparación dentro de celda** (H7). Comparar contra el mismo $\ell$, día de semana y
   temporada. Sin esto el monitor está siempre en rojo y deja de informar.
2. **Ventana de accionabilidad.** Solo se emite alerta con $21 \le \ell \le 75$. Antes de $T-75$ la
   señal es ruido; después de $T-21$ no hay tiempo de reasignar pauta. Fuera de la ventana se
   calcula y almacena igual, para análisis retrospectivo.
3. **Arranque en frío por benchmark** (H8). Las fases 0/1/2 usan comparación transversal, luego
   intra-temporada, luego interanual.
4. **Distinguir "caro" de "agotado".** El informe los trata igual y requieren acciones opuestas: si
   no hay asientos, ninguna inversión publicitaria en Buenos Aires convierte.

### 8.2 Señales

Cada señal se normaliza a $[0,100]$. Con historia disponible se usa el z robusto:

$$z = \frac{x - \operatorname{med}_{\text{celda}}}{1{,}4826 \cdot \operatorname{MAD}_{\text{celda}}} \ \ \text{recortado a } [-4,4], \qquad S = 100 \cdot \Phi(z)$$

En Fase 0 (sin historia) se usan los mapeos transversales directos que siguen.

| Señal | Definición | Mapeo Fase 0 |
|---|---|---|
| **S1 — Brecha de paquete** | $g = \dfrac{\text{TTCI}_{EQS}}{\text{TTCI}_{BRC}} - 1$ a igual $\ell$, con $N{=}4$, $P{=}2$ | $g \le 0 \to 0$; $g \ge 0{,}60 \to 100$; lineal en el medio |
| **S2 — Aceleración tarifaria** | $r = \dfrac{\text{pendiente } F_{EQS} \text{ últimos 14 d}}{\text{pendiente } F_{BRC} \text{ mismo tramo}}$ | $r \le 1 \to 0$; $r \ge 3 \to 100$ |
| **S3 — Presión de capacidad** | $c = 0{,}5\,f_{\text{sin tarifa}} + 0{,}5\,\widetilde{LF}$, con $f$ = fracción de vuelos programados de la semana sin tarifa hallada y $\widetilde{LF}$ = factor de ocupación ANAC de la misma semana del año anterior, normalizado ($0{,}70 \to 0$; $0{,}92 \to 1$) | $S_3 = 100c$ |
| **S4 — Pace de alojamiento** | $p = \dfrac{\text{disponibilidad OTA actual}(\ell)}{\text{disponibilidad de referencia}(\ell)}$ | $p \le 1 \to 0$; $p \ge 1{,}5 \to 100$; lineal |

$S_4$ mide retraso de reservas: **más disponibilidad de la esperada a igual anticipación es la señal
más temprana de una temporada floja**, y es la única que proviene enteramente de datos que Métrica
ya está capturando hoy.

### 8.3 Índice compuesto y bandas

$$\text{IAT} = 0{,}30\,S_1 + 0{,}15\,S_2 + 0{,}30\,S_3 + 0{,}25\,S_4$$

Los pesos privilegian brecha de paquete y capacidad —las dos causas estructurales— sobre la
aceleración, que es la más ruidosa. Son configurables y deben recalibrarse cuando haya elasticidad
estimada.

| Banda | IAT | Significado |
|---|---|---|
| 🟢 Verde | 0–39 | Sin desvío relevante |
| 🟡 Amarillo | 40–59 | Vigilar; sin acción presupuestaria |
| 🟠 Naranja | 60–79 | Reasignación parcial recomendada |
| 🔴 Rojo | 80–100 | Reasignación fuerte + gestión de conectividad |

### 8.4 Histéresis y compuertas

Sin esto, el monitor oscila y pierde credibilidad en la primera semana de uso:

* **Disparo:** IAT por encima del umbral en **3 de las últimas 5** corridas diarias.
* **Cierre:** IAT por debajo de *umbral − 10* en **3 corridas consecutivas**.
* **Enfriamiento:** máximo una alerta por `(destino, semana objetivo)` cada 7 días.
* **Compuerta de cobertura:** si la cobertura de captura de la celda en las últimas 5 corridas es
  <80%, el estado es **"sin señal"** — nunca verde. Un monitor que muestra verde porque no midió es
  peor que no tener monitor.

### 8.5 Salida prescriptiva

La prescripción depende de **cuál señal domina**, no solo del nivel del índice:

| Señal dominante | Diagnóstico | Acción recomendada |
|---|---|---|
| **S3** (capacidad) | *Canal aéreo agotado* | Reasignar **100%** de la pauta aérea BUE/COR de esa semana a emisores terrestres. Gestionar vuelo de refuerzo con AR. La publicidad en BUE no puede convertir: no hay asientos |
| **S1/S2** (precio) | *Canal aéreo caro pero disponible* | Reasignar **~40%**. Mantener presencia en BUE con mensaje de paquete y valor total, no de tarifa. Activar promociones conjuntas con alojamiento para bajar el TTCI |
| **S4** (pace) | *Retraso de reservas sin causa aérea* | Revisar precio hotelero, notoriedad y producto. **No** es un problema de conectividad |
| **S1+S3** | *Estrangulamiento completo* | Reasignación total + escalamiento institucional a ANAC / Secretaría de Transporte con el paquete de evidencia (§3.2 y §4.3) |

**Volumen en riesgo**, para dimensionar la respuesta:

$$\text{pernoctes en riesgo}(W) = \text{plazas totales}(W) \times 7 \times \max\big(0,\ O_{\text{esperada}} - O_{\text{proyectada por pace}}\big)$$

**Presupuesto reasignable:**

$$\text{Reasignable} = \text{pauta}(W) \times \sigma_{\text{aéreo}} \times \kappa, \qquad \kappa = \begin{cases} 1{,}0 & \text{S3 dominante (agotado)} \\ 0{,}4 & \text{S1/S2 dominante (caro)} \end{cases}$$

**Ranking de emisores terrestres de destino**, con decaimiento gravitacional:

$$\text{peso}_e = \text{participación histórica}_e \times \exp\!\left(-\frac{\text{dist}_e}{D_0}\right), \qquad D_0 \approx 600\ \text{km (calibrable)}$$

La participación histórica sale del análisis de origen que ya produce `demanda.py`, y $D_0$ se
calibra contra esa misma serie. Emisores candidatos: Comodoro Rivadavia, Rada Tilly, Trelew, Puerto
Madryn, Caleta Olivia, Valle 16 de Octubre, El Bolsón, Bariloche.

Nótese que $\sigma_{\text{aéreo}}$ —la cuota estructural máxima del canal aéreo de §4.2— aparece
directamente en la fórmula de presupuesto. Si ese número es bajo, el monitor recomendará
reasignaciones pequeñas, y con razón: **no se puede reasignar lo que nunca se invirtió**. Es la
autocorrección que impide que el subsistema aéreo se sobredimensione a sí mismo.

---

## 9. Resumen de indicadores nuevos respecto del informe original

| Indicador | § | Por qué se agrega |
|---|---|---|
| TTCI por persona-noche, con $P$, $N$, $u$ explícitos | 2.1 | El original mezclaba unidades (H4) |
| **Índice de Fuga de Puerta de Entrada (IFPE)** | 2.2 | El arbitraje vía Bariloche es real, medible e invisible hoy |
| **Umbral de estadía compensatoria $N^{\*}$** | 2.3 | Traduce la brecha en una regla de segmentación de marketing |
| **Índice de Compensabilidad (IC)** | 2.4 | Prueba formal de si el ajuste hotelero puede o no cerrar la brecha |
| **Descomposición hedónica del gap tarifario** | 3.2 | Sustituye el ratio/km por evidencia que resiste refutación |
| **Índice de Suficiencia Aérea (ISA)** | 4.1 | Mide el desbalance camas/butacas |
| **Cuota estructural máxima $\sigma_{\text{aéreo}}$** | 4.2 | Determina el encuadre y la prioridad de todo el proyecto (H1) |
| **Valor marginal por frecuencia** | 4.3 | Convierte el reclamo en propuesta cuantificada |
| **Punto de congelamiento $\ell_{90}$** | 5.2 | Fija el calendario operativo de la pauta |
| **Rezago de transmisión $k^{\*}$** | 5.3 | Responde la pregunta causal del informe con un estadístico |
| **Descomposición con residuo explícito** | 7 | Reemplaza el dictamen categórico (H10) |
| **IAT con histéresis y compuerta de cobertura** | 8 | Hace que el monitor sea usable en producción |
