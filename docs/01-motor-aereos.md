# 01 — Motor de captura de aéreos: evaluación y cadencia

Responde el punto 1 del pedido. Precondición: leer H1, H2, H5 y H6 de [`00-revision-critica.md`](00-revision-critica.md).

---

## 1. Qué hay que capturar, exactamente

El informe original mezcla en un solo motor tres cosas que tienen fuentes, latencias y grados de
confiabilidad distintos. Separarlas es la decisión de diseño más importante de esta sección:

| Magnitud | Mejor fuente | Grano | Latencia | ¿Scraping? |
|---|---|---|---|---|
| **Precio** que paga el turista | Metabuscador (Google Flights) | Itinerario × fecha × anticipación | Tiempo real | **Sí** — no hay alternativa |
| **Oferta programada** (frecuencias, horarios, equipo) | Metabuscador + horarios publicados | Vuelo × día | Tiempo real | Sí, barato |
| **Ocupación real** (pax, butacas, factor de ocupación) | **ANAC/SIAC, datos abiertos** | Diario × par OD | 1–3 meses | **No** — es dato oficial gratuito |

La tercera fila es el hallazgo H2. El informe pretendía inferirla por scraping mediante
`seats_remaining` e `is_sold_out`; esos campos son inobservables con el motor primario y, donde
aparecen, son artefactos de marketing. El dato real es público. Ver [`05-fuentes-oficiales.md`](05-fuentes-oficiales.md).

---

## 2. Evaluación comparada de motores

Criterios ponderados por lo que este proyecto necesita: cobertura de los tres operadores, fidelidad
al **precio retail** (el que paga el turista, no la tarifa GDS), costo, fragilidad y —criterio que
el informe no considera y que aquí es central— **defendibilidad pública** del método, porque el
dato va a usarse para sustentar reclamos ante organismos nacionales.

| | (a) Google Flights vía `tfs` | (b) Playwright → `aerolineas.com.ar` | (c1) Amadeus Self-Service | (c2) Duffel | (c3) SerpApi `google_flights` |
|---|---|---|---|---|---|
| **Cobertura AR** | Sí | Sí | Sí (GDS) | Marginal | Sí |
| **Cobertura Flybondi / JetSMART** | **A verificar (F0-1)** | No | **No** (Self-Service excluye low-cost) | No | Igual que (a) |
| **Precio retail real** | Sí | Sí | No — tarifa GDS ≠ web | No | Sí |
| **Familias tarifarias** | No | **Sí** | Sí | Sí | Parcial |
| **Disponibilidad / asientos** | No | Parcial | Sí | Sí | No |
| **Costo marginal** | ~0 | ~0 + proxies si escala | Gratis (test) / pago | Requiere acuerdos | 250/mes gratis; USD 25 / 1k |
| **RAM por consulta** | **≈60 MB** | ≈400 MB (Chromium) | ≈40 MB | ≈40 MB | ≈40 MB |
| **Fragilidad** | Alta (parseo de HTML) | Muy alta (WAF + selectores) | Baja | Baja | Baja |
| **Riesgo de bloqueo** | Medio, gestionable | **Alto — 403 verificado** | Nulo | Nulo | Nulo |
| **Defendibilidad pública** | Media | Baja | Alta | Alta | Alta |

### Veredictos

**(a) Google Flights vía `tfs` — motor primario. Adoptar, con reservas de ingeniería.**
Es la única opción que combina cobertura de los tres operadores, precio retail y costo cero.
**Cobertura confirmada en el VPS:** 18 itinerarios en BUE→BRC con Aerolíneas, Flybondi y JetSMART.
Pero, corrigiendo H5: **no es una API**. Se codifica la consulta en protobuf base64 (`tfs`) y la
respuesta son **arrays JSON anidados sin esquema**. Tres consecuencias operativas obligatorias:

1. **Vendorizar** el codificador protobuf en lugar de depender de una librería de un solo
   mantenedor. El esquema de `tfs` es estable y pequeño; la dependencia externa es el riesgo.
2. **Fixtures y tests de contrato, con al menos un itinerario de cada operador.** Verificado que
   hace falta: el parser de `fast-flights` 3.1.0 rompe con Flybondi porque el precio está en
   `k[0][2][0][31]` y no en `k[1][0][1]`. Una fixture con solo Aerolíneas habría pasado el test.
3. **Canario por aerolínea, no del total.** Alerta si los itinerarios extraídos de **cualquier
   operador** caen más de 30% respecto de su propia mediana móvil de 7 días. El fallo de Flybondi
   demuestra por qué: un contador global no lo habría detectado —los otros dos compensan— y la
   serie habría quedado sesgada en silencio justo en la dirección que invalida la tesis.

**Extracción robusta, no índices fijos.** Acceder por posición a un array anidado sin documentar es
tan frágil como parsear HTML. El extractor debe intentar la ruta conocida por operador y, si falla,
**buscar el precio recorriendo la estructura** (primer entero plausible dentro del rango esperado
para la ruta) antes de declarar `parse_error`. Y registrar en la bitácora **por qué camino** se
extrajo cada precio: cuando Google cambie el layout, ese campo dice exactamente qué se rompió.

> **F0-1, la prueba que decide el proyecto.** Si Google Flights **no** lista Flybondi en
> `BUE→BRC`, el motor primario mide solo Aerolíneas y toda comparación EQS vs BRC queda sesgada a
> favor de Bariloche… en la dirección equivocada: subestimaría la brecha. Es la primera consulta
> del spike y condiciona el resto. Si falla, la respuesta **no** es Amadeus (H6) sino scraping
> puntual y semanal de `flybondi.com` solo para la ruta BUE-BRC, como corrector de nivel.

**(b) Playwright contra `aerolineas.com.ar` — no como estrategia general; sí como sonda quirúrgica.**
El informe lo plantea como Estrategia 2 de resiliencia. Es la asignación de esfuerzo equivocada:
combatir Azure Application Gateway + Akamai desde una IP de datacenter es un gasto recurrente de
mantenimiento, y el retorno es marginal porque AR es **monopolista en EQS** y su tarifa ya aparece
en el metabuscador. Lo que sí justifica el navegador es lo único que Google no entrega y que el
modelo necesita: **familias tarifarias y disponibilidad declarada**. Uso acotado:

* Solo fechas ancla, solo ruta `AEP–EQS` y `AEP–BRC` como control.
* **≤20 consultas por semana**, en horario disperso.
* Reutilizar el runtime ya instalado —`PLAYWRIGHT_BROWSERS_PATH` apuntando al directorio de
  navegadores existente— e instalar únicamente el paquete Python en un venv. **Cero descargas de
  navegador, cero imágenes Docker nuevas.**
* Si el 403 persiste: registrar el fallo y seguir. Esta sonda es **enriquecimiento opcional**,
  nunca camino crítico. Ningún indicador del tablero debe depender de ella.

**(c1) Amadeus Self-Service — descartar.** Ver H6: excluye low-cost, y el sesgo resultante apunta
exactamente en la dirección que invalidaría la tesis del observatorio.

**(c2) Duffel — descartar.** Requiere acuerdos de distribución y condición de vendedor de viajes;
cobertura doméstica argentina marginal. No es una opción real para un organismo público de turismo.

**(c3) SerpApi — adoptar como seguro de continuidad, con presupuesto cerrado.**
Devuelve el mismo universo de contenido que el motor primario, en JSON estructurado. Es el fallback
correcto porque **no cambia el universo medido**, solo el mecanismo de acceso —lo que preserva la
comparabilidad de la serie, cosa que Amadeus destruiría—. Escalones publicados: 250 búsquedas/mes
gratis, USD 25 / 1.000, USD 75 / 5.000. Dimensionamiento: con fallback restringido a **fechas ancla
de T1/T2 dentro de la ventana accionable**, el consumo esperado es de 300–800 llamadas/mes, es
decir el plan gratuito o el de USD 25. Presupuesto duro configurable y contador persistente que
corta al llegar al tope.

### Cascada resultante

```
Capa 0  ANAC/SIAC + EOH  ── mensual ──► verdad histórica: pax, butacas, factor de ocupación real
                                        (calibra modelos, resuelve arranque en frío)

Capa 1  Google Flights `tfs`  ── diaria ──► precio prospectivo   [~60 MB RAM, sin navegador]
           │
           ├─ ok ────────────────────────► bronce JSONL.gz
           │
           └─ falla (429 / 302 / 0 filas / canario en rojo)
                       │
                       ├─ ¿celda crítica y dentro de ventana accionable?
                       │        SÍ ──► Capa 3: SerpApi (presupuesto acotado)
                       │        NO ──► registrar hueco en air_scrape_runs y continuar
                       │
                       └─ 3 fallas consecutivas ──► circuit breaker: aborta la corrida,
                                                    marca el día como parcial, notifica

Capa 2  Playwright → aerolineas.com.ar  ── semanal, ≤20 consultas ──► familias tarifarias
                                            (enriquecimiento opcional, jamás camino crítico)
```

Nótese la diferencia con el diagrama del informe: allí Playwright era el fallback general de
Google Flights. Aquí **no lo es** —el fallback de Google Flights es SerpApi, que mide lo mismo—, y
Playwright pasa a capturar una dimensión distinta que ninguna otra fuente entrega.

---

## 3. Registrar los huecos es tan importante como registrar los datos

Corolario de H3-#4, y la parte que más se omite en proyectos de scraping. Cada consulta planificada
debe dejar rastro en `air_scrape_runs` con su resultado: `ok`, `sin_resultados`, `bloqueado`,
`timeout`, `parse_error`, `omitido_por_presupuesto`. Sin esto:

* Una caída del scraper durante un fin de semana largo se lee después como "no había vuelos".
* Y al revés: un día sin servicio se lee como una falla de captura. Por eso `sin_servicio` es un
  estado **distinto** de `sin_resultados`. Esquel no vuela los martes: si esos días descuentan
  cobertura, la métrica queda clavada en ~71% y la marca "preliminar" no se apaga nunca.

### 3.0 Filtro de pertinencia: no todo lo que conecta A con B es mercado

La primera corrida nocturna completa devolvió, sobre rutas de cabotaje patagónico,
**13 itinerarios de LATAM y 4 de GOL**. Ninguna de las dos opera cabotaje argentino: GOL
solo conecta aeropuertos argentinos con sus hubs brasileños, y LATAM cerró su filial
doméstica en 2020 y vuela a Bariloche desde hubs internacionales. Es decir, son
**BUE→BRC vía São Paulo o vía Santiago**: desvíos internacionales que Google ofrece como
alternativa y que no son el mercado que el observatorio mide.

Diecisiete de 900 parece poco. No lo es:

* Contaminan la **mediana** de la celda.
* Pueden ganar el `is_cheapest_of_query` y quedar registrados como "el precio del mercado".
* **Rompen del todo la normalización por kilómetro**, que divide por la distancia
  geodésica directa mientras el itinerario real pasó por Brasil. El indicador de paridad
  —el más importante para la discusión pública— quedaría calculado sobre un absurdo.

Criterios de pertinencia para una ruta doméstica:

| Criterio | Regla |
|---|---|
| Escalas dentro del país | Todos los aeropuertos de escala en Argentina |
| Operador con cabotaje | El operador debe tener derechos domésticos vigentes |
| Duración | ≤ 2,5 × la duración del vuelo directo de referencia |
| Escalas | ≤ 1, salvo rutas sin directo (COR–EQS fuera de temporada), donde ≤ 2 |

Los itinerarios no pertinentes **se registran igual** —la capa bronce guarda hechos— con
`itinerario_relevante = false` y su motivo, y se excluyen de todo agregado. Así el filtro
se puede revisar y re-aplicar sin volver a scrapear, y de paso queda la serie de "cuántas
veces Google ofreció un desvío internacional", que es en sí un indicador de escasez de
oferta doméstica.

### 3.1 La capa bronce registra hechos, no interpretaciones

`sin_servicio` es una **inferencia**, y las inferencias envejecen: el servicio cambia por temporada
y por acuerdo comercial. Si se graba la conclusión y no la evidencia, el día que el calendario
cambie hay que volver a scrapear un pasado que ya no existe.

Por eso la bitácora guarda los **hechos** que permiten re-derivar la clasificación:

| Campo | Qué registra |
|---|---|
| `itineraries_found` + `itineraries_por_aerolinea` | cuántos y de quién |
| `respuesta_valida` | ¿la respuesta contiene evidencia de que el buscador entendió la consulta? |
| `calendario_explica` | ¿el calendario versionado explicaba el cero, al momento de capturar? |
| `calendario_version` | con qué versión del calendario se evaluó |

Y `sin_servicio` exige **las tres condiciones a la vez**: cero itinerarios, respuesta
estructuralmente válida, y calendario que lo explique. La segunda es la que importa y la que se
olvida: sin ella, **un bloqueo blando que devuelva HTTP 200 vacío en un día sin servicio se
registra como dato legítimo y no descuenta cobertura** — el peor error posible, porque el sistema
se auto-certifica sano mientras deja de medir.

Regla de default: para una ruta **sin entrada en el calendario, nunca se asume `sin_servicio`**.
Es preferible subestimar la cobertura que inventar un dato.

El calendario vive en [`specs/config/calendario_servicio.json`](../specs/config/calendario_servicio.json)
como semilla verificada por el OIT, y se contrasta contra el calendario **derivado** de las
observaciones. Si difieren tres semanas seguidas, gana el derivado y se actualiza la semilla.

### 3.2 Canario: el umbral no puede ser el mismo en rutas densas y finas

BUE–BRC devuelve ~18 itinerarios por consulta; BUE–EQS devuelve 1 o 2. Con mediana 2, perder un
itinerario es −50% y dispara el umbral de −30% **por variación normal de disponibilidad**. En la
ruta que más importa, un canario por conteo lloraría lobo todos los días — y un canario que se
ignora es peor que ninguno.

| Tipo de ruta | Criterio | Umbral |
|---|---|---|
| **Densa** (mediana de 7 días ≥ 5 itinerarios) | Caída de conteo por operador | −30% |
| **Fina** (mediana < 5) | **Desaparición del operador** donde antes aparecía | 3 corridas consecutivas |

En rutas finas la señal no es *cuántos*, es *si el operador dejó de aparecer*.
* El semáforo de saturación confunde *ausencia de oferta* con *ausencia de medición*.
* La cobertura no se puede reportar, y sin cobertura declarada ningún dato es publicable.

Regla derivada: **ninguna serie del tablero se muestra sin su porcentaje de cobertura**, y por
debajo de 80% de cobertura en la celda la serie se marca visualmente como preliminar.

---

## 4. Cadencia de muestreo: diseño y presupuesto

El error a evitar es muestrear todas las fechas todos los días: genera ~90% de observaciones
redundantes, multiplica el riesgo de bloqueo y no agrega poder analítico. La cadencia se deriva del
**valor analítico de cada fecha**, no de un calendario uniforme.

### 4.1 Niveles de ruta

| Nivel | Rutas | Cadencia | Justificación |
|---|---|---|---|
| **T1 Núcleo** | `BUE↔EQS`, `COR↔EQS` | Diaria | Objeto del observatorio |
| **T2 Benchmark primario** | `BUE↔BRC`, `BUE↔CPC`, `COR↔BRC` | Diaria | Sustitutos cordilleranos directos; habilitan la comparación transversal del día 1 (H8) |
| **T3 Benchmark secundario** | `BUE↔PMY`, `REL`, `CRD`, `USH`, `FTE` | Cada 3 días | Contexto patagónico; la variación intradiaria no cambia conclusiones |
| **T4 Combustible de regresión** | ~12 rutas domésticas adicionales (MDZ, NQN, IGR, SLA, JUJ, TUC, RGL, RGA, BHI, …) | Semanal, 4 anticipaciones fijas | **Sin estas rutas el modelo de paridad hedónica (§2.4 de `docs/02`) no tiene identificación.** Costo marginal ínfimo |

Optimización que reduce un tercio del presupuesto: consultar el **código de ciudad `BUE`** en lugar
de `AEP` y `EZE` por separado. Aerolíneas opera EQS solo desde Aeroparque, y el metabuscador
devuelve el aeropuerto efectivo en cada itinerario.

> **⚠ Corrección tras la primera corrida (F1a).** La observación atómica es **one-way, y cada
> sentido es una consulta propia** — `bidireccional: true` en la config expande cada ruta en dos.
> La versión anterior pedía *round trip* con retorno fijo a +3 días, y estaba mal por tres razones,
> en orden creciente de gravedad:
>
> 1. **Cobertura.** Con servicio diario salvo martes, el round trip falla si la ida es martes o si
>    la vuelta cae martes: ~29% de las fechas ancla perdidas, y **siempre los mismos días de
>    semana**. No es ruido: es un sesgo de día de semana metido en la serie desde el primer día.
>    Peor: los viernes zafan (viernes+3 = lunes), así que los que caen son justo los **puentes y
>    los hitos**, las fechas de mayor valor.
> 2. **Curva de anticipación.** La curva se define como $F(t,\ell)$ por fecha de vuelo. Una
>    observación de round trip tiene **un precio atado a dos `flight_date`** y no se puede
>    desagregar: la serie de $t$ queda contaminada con el precio de $t+3$. Con round trip como
>    serie base, el indicador central del sistema no es computable de forma limpia.
> 3. **TTCI.** El TTCI se calcula en el navegador con $N$ elegido por el usuario. Con retorno fijo
>    a +3 solo existe TTCI para $N=3$. Componiendo desde one-way,
>    $\text{TTCI}(N) = F_{\text{ida}}(t) + F_{\text{vuelta}}(t+N)$ para cualquier $N$.
>
> El round trip pasa a ser una **medición de calibración** sobre ~8 consultas semanales, para
> estimar el descuento RT por aerolínea y corregir el TTCI compuesto.
>
> Presupuesto con la corrección: tiers 1–2 en ambos sentidos son 10 rutas × ≈14,3 fechas ancla
> activas ≈ **143 consultas/día**, dentro del tope de 250.

### 4.2 Conjuntos de fechas objetivo

| Conjunto | Definición | Observación | Para qué sirve |
|---|---|---|---|
| **A. Fechas ancla** (~87/año) | Todos los viernes (52) + días puente de fines de semana largos (~15) + **muestras** de hitos: Invierno/La Hoya, Tulipanes, Eclipse 2027 (~20 en total, **no el rango completo**) | **Diaria** en `T-45…T-1`; **cada 3 días** en `T-90…T-46` | Curvas de anticipación de alta resolución. Es el activo analítico central |
| **B. Rolling 30 días** | Fechas de `T+1…T+30` que no son ancla | Cada 3 días | Cobertura continua, detección de anomalías puntuales |
| **C. Checkpoints** | `T+45, 60, 90, 120, 150, 180` | Semanal | Curva de largo plazo y apertura de ventas de temporada |

El conjunto A concentra el valor: es donde se ve *cuándo* se congela la demanda, que es la pregunta
que el informe formula en su §4.1.3 y que sin muestreo denso no tiene respuesta.

### 4.3 Presupuesto de consultas

Consultas por ruta y por día, con las cadencias anteriores:

| Componente | Cálculo | Consultas/día/ruta |
|---|---|---|
| Ancla, ventana densa `T-45…T-1` | 87 × 45/365 | ≈ 10,7 |
| Ancla, ventana amplia `T-90…T-46`, ÷3 | 87 × 45/365 ÷ 3 | ≈ 3,6 |
| Rolling no-ancla (≈23 fechas), ÷3 | 23 ÷ 3 | ≈ 7,7 |
| Checkpoints (6 fechas), ÷7 | 6 ÷ 7 | ≈ 0,9 |
| **Subtotal por ruta diaria** | | **≈ 22,9** |

Total del sistema:

| Nivel | Rutas | Factor de cadencia | Consultas/día |
|---|---|---|---|
| T1 + T2 | 5 | × 1 | ≈ 115 |
| T3 | 5 | ÷ 3 | ≈ 38 |
| T4 | 12 × 4 fechas | ÷ 7 | ≈ 7 |
| **Total** | | | **≈ 160** |

Con esto:

* **Tope duro: 250 consultas/día.** Al alcanzarlo la corrida se detiene y marca el resto como
  `omitido_por_presupuesto` (queda registrado, no desaparece).
* **Ritmo:** una consulta cada `uniform(15, 45)` segundos → ≈80 minutos de reloj. Ventana
  02:00–05:00 ART, con margen amplio para reintentos.
* **Concurrencia = 1.** No hay razón para paralelizar: el cuello de botella es la política
  anti-bloqueo, no el CPU.
* **Memoria: ≈60–90 MB** en un proceso Python sin navegador. Es ~15% de lo que costaría la misma
  cadencia con Chromium, y es lo que hace que este subsistema sea invisible para Métrica.

### 4.4 Volumen y política de retención

| Capa | Contenido | Volumen estimado | Retención |
|---|---|---|---|
| **Bronce** | JSONL.gz de registros parseados, uno por corrida | ≈1.300 filas/día → ≈480k filas/año, decenas de MB/año | Permanente |
| **Bronce-crudo** | **Blob JSON extraído** (lo que consume el parser) | a medir en la primera semana | 90 días |
| **Bronce-página** | Página HTML completa | **≈2 MB comprimida × consulta** — medido en producción | 5 muestras/día durante 7 días, como fixtures |
| **Plata** | Parquet particionado por `observed_date` | Compresión ~10× sobre bronce | Permanente |
| **Oro** | Arrow para el tablero | Ver presupuesto de bytes en `docs/03` §5 | Se regenera |

> **⚠ Corregido con medición real.** La estimación original de ~40 KB por respuesta estaba mal por
> un factor de cincuenta: la página de Google Flights pesa **≈2 MB ya comprimida**. A 172
> consultas/día son **358 MB/día**, es decir **31 GB a 90 días** y **~55 GB con F1b completo**.
> Insostenible en el VPS, y el problema aparece recién a las tres semanas, cuando ya hay serie que
> perder.
>
> La corrección: guardar el **blob JSON que el parser consume**, no la página entera. Es lo que
> hace falta para reprocesar, y es uno o dos órdenes de magnitud más chico. La página completa
> queda solo como muestra de fixtures.
>
> Y una regla que faltaba: **presupuesto de disco declarado** (8 GB para bronce), con poda
> automática de lo más antiguo y aviso en `meta.json` al superarlo. Un colector que llena el disco
> no solo se rompe él: se lleva puesto a Métrica y al tablero, que comparten VPS.

### 4.5 Ingeniería anti-bloqueo

Medidas por orden de eficacia real:

1. **Volumen bajo.** 160 consultas/día espaciadas es el factor decisivo; todo lo demás es
   secundario. No hay técnica de evasión que compense un patrón de tráfico agresivo.
2. **Jitter no uniforme.** `uniform(15, 45)` s con una pausa larga aleatoria (3–8 min) cada ~25
   consultas. Un intervalo constante es la firma más fácil de detectar.
3. **Orden aleatorizado con pesos de prioridad.** Si la corrida se trunca, no debe perderse siempre
   la misma ruta. Barajar respetando que T1 salga primero.
4. **Cabeceras coherentes y localización explícita**: `hl=es-AR`, `gl=AR`, `curr=ARS`. Coherencia
   entre `User-Agent`, `Accept-Language` y `Sec-CH-UA`; un `User-Agent` incompleto produce la
   redirección 302 a "página no soportada" que el informe ya observó.
5. **Backoff exponencial con tope** ante 429 o redirección a interstitial: 60 s → 300 s → 900 s.
6. **Circuit breaker:** tres fallos consecutivos abortan la corrida y la marcan como parcial. Es
   preferible un día con 40% de cobertura declarada a una IP quemada.
7. **Segunda moneda separada.** Consultar USD solo para fechas ancla de T1/T2 (duplica el costo de
   esas celdas). Para el resto, convertir con `fx_daily` de Métrica y registrar `fx_source`.

Nota de encuadre: se captura precio público exhibido, con volumen bajo, sin eludir autenticación,
sin revender datos y publicando la metodología. Es un uso consistente con la función de un
observatorio público. Cuando un número vaya a publicarse como estadística oficial, la vía correcta
es el dato de ANAC (Capa 0), no el scrapeado.

---

## 5. Programación en el host

Usar **systemd timer + unidad `oneshot`**, no un proceso residente con APScheduler. Un timer no
consume memoria mientras no corre; un scheduler residente sí, y para una corrida nocturna diaria no
aporta nada. Además permite limitar recursos declarativamente:

```ini
# /etc/systemd/system/metrica-aereos.service
[Service]
Type=oneshot
Nice=10
MemoryMax=512M
CPUQuota=50%
ExecStartPre=/opt/metrica-aereos/bin/preflight.sh
ExecStart=/opt/metrica-aereos/venv/bin/python -m aereos.collect --config /etc/metrica-aereos/rutas.json
```

`preflight.sh` implementa la guardia de H13-b: aborta con código 0 (corrida diferida, no fallida) si
la memoria disponible está por debajo de un umbral o si hay procesos Chromium activos. Con la
estrategia primaria sin navegador esta guardia casi nunca se dispara, pero cubre el caso en que la
sonda Playwright semanal coincida con una corrida de Métrica.

---

## 6. Checklist de validación F0

Ejecutar en el VPS **antes de escribir el colector**. Script en
[`specs/scripts/f0_validacion.py`](../specs/scripts/f0_validacion.py).

| # | Prueba | Criterio de aprobación | Si falla |
|---|---|---|---|
| **F0-1** | Google Flights `BUE→BRC`, T+30: ¿aparece Flybondi? ¿y JetSMART? | Al menos un itinerario de cada low-cost | Agregar scraping semanal de `flybondi.com` solo BUE-BRC como corrector de nivel. **No** usar Amadeus |
| **F0-2** | Google Flights `BUE→EQS`, T+30 / T+60 / T+90 | ≥1 itinerario en cada fecha, precio en ARS | Revisar cabeceras y `curr`; probar SerpApi |
| **F0-3** | 30 consultas espaciadas 20 s desde la IP del VPS | 0 bloqueos, 0 redirecciones a interstitial | Bajar ritmo a 60 s y recalcular presupuesto |
| **F0-4** | Descarga del CSV de ANAC "Conectividad Aérea" | Archivo con columnas de OD, pasajeros y butacas; filas con EQS | Ver `docs/05` §4 para rutas alternativas de acceso |
| **F0-5** | Descarga de series EOH | Serie de ocupación con desagregación patagónica | Usar solo cluster Métrica como factor regional |
| **F0-6** | Lectura del PostgreSQL de Métrica con rol de solo lectura y las consultas del contrato | p95 < 10 s, resultados no vacíos | Evaluar vistas materializadas (solo entonces) |
| **F0-7** | `COR→EQS`, T+30 | Devuelve itinerarios con conexión y duración total | Modelar Córdoba solo vía AEP |
| **F0-8** | Cálculo de cuota estructural máxima del canal aéreo (§2.5 de `docs/02`) | Número obtenido con datos del OIT | — |

**F0-8 es la prueba de sentido del proyecto, no una prueba técnica.** Su resultado determina si el
subsistema aéreo se construye como herramienta de optimización de marketing o como instrumento de
evidencia para gestión. Ambas son valiosas, pero ordenan el backlog de manera distinta.

---

## Fuentes consultadas

- [fast-flights — A Python API for Google Flights (via Protobuf Reverse Engineering)](https://themenonlab.blog/blog/fast-flights-google-flights-api-python)
- [AWeirdDev/flights — repositorio de `fast-flights`](https://github.com/AWeirdDev/flights)
- [Flight APIs Tutorial — Amadeus for Developers](https://developers.amadeus.com/self-service/apis-docs/guides/developer-guides/resources/flights/)
- [JetSmart inks GDS deal with Amadeus — Travel Weekly](https://www.travelweekly.com/Travel-News/Airline-News/JetSmart-inks-GDS-deal-Amadeus)
- [Google Flights API — SerpApi](https://serpapi.com/google-flights-api)
- [Flights to Esquel (EQS) — FlightConnections](https://www.flightconnections.com/flights-to-esquel-eqs)
- [Esquel Airport — Wikipedia](https://en.wikipedia.org/wiki/Esquel_Airport)
- [Flybondi — Wikipedia](https://en.wikipedia.org/wiki/Flybondi)
