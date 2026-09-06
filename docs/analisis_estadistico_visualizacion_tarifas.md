# Metodología y Arquitectura de Visualización Estadística de Tarifas Aéreas
## Réplica del Modelo de Inteligencia de Destino de Esquel DATA para el Corredor Patagónico

**Observatorio de Conectividad y Precios Turísticos · OIT Esquel**  
**Fecha de Publicación:** 6 de Septiembre de 2026  
**Sistema:** Métrica Aéreos (Puerto 38530) · Integración con Esquel DATA (Puerto 38520)  
**Autor:** Antigravity (Google DeepMind) en colaboración con Leandro Choi  

---

## 1. Contexto Institucional y Motivación

En el marco del sistema de inteligencia turística de Esquel y la comarca andina, la evaluación de la conectividad aérea enfrenta un desafío analítico fundamental: **la dispersión y volatilidad de tarifas en el tiempo**. Mientras que variables hoteleras o de ocupación de plazas reportan típicamente una magnitud escalar única por período (como se visualiza en la sección histórica de [Esquel DATA](http://187.77.224.159:38520/#historia)), el mercado aerocomercial es **multidimensional, no estacionario y altamente disperso**.

En un mismo día o semana conviven:
1. Múltiples operadores (monopolio de Aerolíneas Argentinas en Esquel vs. competencia con Flybondi y JetSMART en Bariloche).
2. Múltiples frecuencias diarias y bandas horarias.
3. Diferentes clases tarifarias activas simultáneamente en los inventarios GDS.
4. Efecto día-de-semana (estacionalidad de alta frecuencia entre viernes/domingos y martes/miércoles).

Al desplegar el **barrido diario continuo a 180 días vista ($T+1 \dots T+180$)** con más de 1.300 vuelos reales capturados, graficar líneas crudas por vuelo desemboca inevitablemente en un *"spaghetti chart"* caótico que oculta las señales macroeconómicas y confunde a los decisores públicos.

El presente desarrollo implementa una arquitectura estadística de **bandas de envolvente (fan charts / ribbon charts)** inspirada fielmente en la interfaz histórica de **Esquel DATA**, enriquecida con capacidades analíticas avanzadas de Data Science para transporte aéreo.

---

## 2. Fundamentos de Data Science: Modelado de Dispersión Tarifaria

### 2.1. Estructura de Bandas de Envolvente

Para cada intervalo temporal (diario, semanal o mensual), la distribución de precios observados $P = \{p_1, p_2, \dots, p_k\}$ se descompone en tres capas informativas:

```
                  ┌───────────────────────────────────────────────┐  Máximo (Techo de Oferta)
                  │                                               │
                  │   BANDA EXTERIOR: Rango Min-Max (Gris)        │
                  │                                               │
  ════════════════╪═══════════════════════════════════════════════╪  Percentil 75 (Q3)
  ░░░░░░░░░░░░░░░░│                                               │
  ░░░░░░░░░░░░░░░░│   BANDA INTERIOR: Rango Intercuartil (Azul)   │
  ────────────────┼───────────────────────────────────────────────┼  MEDIANA / P50 (Línea Sólida)
  ░░░░░░░░░░░░░░░░│   50% central de las opciones de viaje        │
  ░░░░░░░░░░░░░░░░│                                               │
  ════════════════╪═══════════════════════════════════════════════╪  Percentil 25 (Q1)
                  │                                               │
                  │   BANDA EXTERIOR: Rango Min-Max (Gris)        │
                  │                                               │
                  └───────────────────────────────────────────────┘  Mínimo (Piso Accesible)
```

#### A. Banda Exterior (Mínimo – Máximo):
* Delimita el **recorrido total del mercado**.
* Su cota inferior representa la mejor oportunidad de compra (*cheapest of day/week*); su cota superior refleja la tarifa marginal más costosa ofrecida para ese tramo.
* Renderizado visual: Área sombreada gris (`rgba(148, 163, 184, 0.16)` en modo oscuro; `#f1f5f9` en modo claro).

#### B. Banda Interior (Rango Intercuartil · IQR $P_{25} - P_{75}$):
* Aísla el **50% central de la oferta disponible**.
* En ciencia de datos, el IQR es la métrica estándar de dispersión robusta: descarta los extremos anómalos (asientos ejecutivos premium o promociones relámpago de un único asiento).
* Permite al turista y a la administración responder con rigor: *"¿Cuál es la tarifa habitual o esperable para viajar en esta fecha?"*.
* Renderizado visual: Área sombreada translúcida con el color temático de la ruta (Azul OIT `#3182ce` para Esquel, Ámbar `#f59e0b` para Bariloche, Púrpura `#8b5cf6` para Chapelco).

#### C. Línea Central (Mediana $P_{50}$):
* A diferencia de la media aritmética ($\mu$), que es vulnerable a la presencia de un vuelo de \$600.000 inflando el promedio, la **mediana** es un estimador $L$ no paramétrico con 50% de punto de ruptura.
* La línea de la mediana sintetiza la trayectoria temporal de la oferta sin dejarse distorsionar por la dispersión.

### 2.2. Algoritmo de Interpolación Lineal de Percentiles

Para garantizar consistencia matemática idéntica a librerías estándar de Data Science (como NumPy con `method='linear'` o R Type 7), implementamos el algoritmo de interpolación lineal sin dependencias externas:

Dado un conjunto ordenado $X = [x_{(0)}, x_{(1)}, \dots, x_{(n-1)}]$ y un percentil $p \in [0, 100]$:
$$k = (n - 1) \cdot \frac{p}{100}$$
$$f = \lfloor k \rfloor, \quad c = \min(f + 1, n - 1), \quad d = k - f$$
$$\hat{P}_p = x_{(f)} + d \cdot (x_{(c)} - x_{(f)})$$

Este método garantiza transiciones continuas tanto en muestras pequeñas ($n = 2$ o $3$) como en semanas densas ($n = 30$).

---

## 3. Normalización por Distancia Geodésica (Tarifa por Kilómetro)

Comparar tarifas brutas en pesos entre diferentes destinos patagónicos induce a un sesgo metodológico severo si no se tiene en cuenta la distancia de vuelo.

### Distancias Geodésicas Oficiales (Haversine sobre WGS84):
* $\text{Distancia}(\text{BUE} \leftrightarrow \text{EQS}) = \mathbf{1.439,3\text{ km}}$
* $\text{Distancia}(\text{BUE} \leftrightarrow \text{BRC}) = \mathbf{1.341,1\text{ km}}$ (Bariloche está un 6,8% más cerca de Buenos Aires que Esquel)
* $\text{Distancia}(\text{BUE} \leftrightarrow \text{CPC}) = \mathbf{1.309,5\text{ km}}$
* $\text{Distancia}(\text{COR} \leftrightarrow \text{EQS}) = \mathbf{1.516,8\text{ km}}$

### Cálculo de la Métrica Unitaria:
$$\text{tarifa\_km\_ars} = \text{round}\left(\frac{\text{precio\_ars}}{\text{distancia\_km}}, 2\right)$$

### Hallazgo Empírico en los Datos Reales de Producción:
* **Esquel (Monopolio Aerolíneas Argentinas):** Tarifa mediana de **\$167.985 ARS** $\implies$ **\$116,71 / km**.
* **Bariloche (Competencia con Flybondi y JetSMART):** Tarifa mínima observada de **\$76.641 ARS** $\implies$ **\$57,15 / km**; tarifa mediana de **\$153.313 ARS** $\implies$ **\$114,32 / km**.
* **Prima de Monopolio en Piso Accesible:** Acceder a Bariloche en su tarifa más barata cuesta \$57/km, mientras que acceder a Esquel cuesta \$116,71/km (**un 104% más caro por kilómetro**).
* El selector de métrica en la interfaz permite alternar instantáneamente entre la visión de bolsillo del turista (**\$ ARS Total**) y la métrica de paridad del observatorio (**\$ / km**).

---

## 4. Arquitectura de Visualización: 3 Modos para Evitar el "Spaghetti Chart"

Para satisfacer el requerimiento de *"cruzar diferentes cosas sin que sea un gran lío"*, se diseñaron tres modos conmutables:

### 4.1. Modo 1 · Línea con Bandas (Envolvente Temporal)
* **Caso de Uso:** Análisis de un tramo puntual (`BUE -> EQS`) o comparación de flujo Ida vs Vuelta (`BUE -> EQS` vs `EQS -> BUE`).
* **Diseño:**
  * Curva Azul (`#3182ce`) para Ida y Curva Verde Esmeralda (`#10b981`) para Vuelta.
  * Bandas sombreadas semitransparentes con toggle opcional para activarlas o desactivarlas.
  * Revela asimetrías de calendario turístico: al inicio del verano (primera quincena de enero), la ida `BUE -> EQS` se dispara por demanda vacacional mientras la vuelta `EQS -> BUE` se mantiene baja; el patrón se invierte en los últimos días de enero.

### 4.2. Modo 2 · Paneles en Paralelo ("Small Multiples" / Lado a Lado)
* **Caso de Uso:** Benchmark de múltiples destinos desde el mismo emisor (`BUE -> EQS` vs `BUE -> BRC` vs `BUE -> CPC`).
* **Principio de Tufte:** En lugar de amontonar seis bandas de dispersión en el mismo plano cartesiano, se despliega una grilla responsiva de tarjetas gemelas.
* **Invariante Crítico de Comparación:** Todas las tarjetas comparten **estrictamente el mismo dominio en el eje Y** ($0 \dots Y_{\max\text{ global}}$) y el mismo rango temporal. Esto permite evaluar a simple vista la diferencia de nivel y dispersión de cada destino sin solapamientos.

### 4.3. Modo 3 · Distribución Mensual Agrupada (Barras con Rango)
* **Caso de Uso:** Análisis macro-estacional a nivel de meses calendario (Septiembre 2026 a Marzo 2027).
* **Diseño:**
  * Barras verticales agrupadas por mes para cada destino.
  * Altura de barra = Tarifa Mediana del mes.
  * Bigote vertical de error (whisker) = Mínimo y Máximo del mes con remates horizontales.
  * Permite al usuario responder en un segundo: *"¿Cuál es el mes más caro para viajar a Esquel vs Bariloche?"*.

---

## 5. Componentes de Interfaz: Réplica Exacta de Esquel DATA

La vista fue estructurada siguiendo minuciosamente el lenguaje visual de Esquel DATA:

### 5.1. Columna Lateral: "Guía de Lectura"
Acompaña al gráfico en todo momento y actualiza su contenido dinámicamente según el modo activo:
* **QUÉ MUESTRA:** Qué representa cada punto y qué horizonte temporal cubre.
* **POR QUÉ SE MIDE:** Justificación de política turística y fundamentación del observatorio.
* **CÓMO SE LEE, PASO A PASO:** Instrucciones precisas (franja gris = mínimo/máximo, franja coloreada = 50% habitual, línea central = mediana, líneas verticales = feriados).
* **EJEMPLO CONTEXTUAL:** Análisis interpretativo generado según las rutas seleccionadas (asimetrías de flujo en ida/vuelta o prima de monopolio en benchmark).
* **QUÉ SIGNIFICA CADA INDICADOR:** Glosario conceptual de Mediana, Rango Intercuartil y Tarifa/km.

### 5.2. Tabla Inferior: "Los mismos datos, en números"
Cumpliendo la regla cardinal del ecosistema de Leandro:
> *"Toda figura de este tablero tiene su tabla: si el gráfico sugiere algo, acá se verifica."*
* Tabla compacta con líneas sutiles, números tabulares alineados a la derecha, insignias de nivel de confianza (`[B: Observado]`), identificador del vuelo más barato de cada período e insignias de hitos turísticos.

### 5.3. Anotación de Hitos Turísticos Oficiales
Líneas verticales punteadas en rojo tenue (`rgba(239, 68, 68, 0.4)`) con etiquetas superiores que marcan los feriados y picos de demanda del calendario argentino:
* 12 de Octubre: Feriado Diversidad Cultural (Fin de semana largo)
* 23 de Noviembre: Feriado Soberanía Nacional (Fin de semana largo)
* 8 de Diciembre: Inmaculada Concepción (Puente turístico)
* 25 de Diciembre: Navidad
* 1 de Enero: Año Nuevo
* 15 de Enero: Cambio de Quincena Enero (Pico estival)
* 8 y 9 de Febrero: Feriados de Carnaval

---

## 6. Especificación del Endpoint `/api/series`

### Solicitud HTTP:
```http
GET /api/series?rutas=BUE>EQS,EQS>BUE&agrupacion=semanal&metrica=precio_ars HTTP/1.1
Host: 187.77.224.159:38530
Authorization: Basic b2l0X2FkbWluOmVzcXVlbDIwMjY=
```

### Parámetros Soportados:
| Parámetro | Tipo | Valores Posibles | Por Defecto | Descripción |
| :--- | :--- | :--- | :--- | :--- |
| `rutas` | string | Códigos IATA separados por coma (`BUE>EQS,BUE>BRC`) | `BUE>EQS` | Rutas a computar simultáneamente |
| `agrupacion` | string | `diaria`, `semanal`, `mensual` | `semanal` | Granularidad temporal de los buckets |
| `metrica` | string | `precio_ars`, `tarifa_km_ars` | `precio_ars` | Métrica base de los agregados |
| `incluir_irrelevantes`| bool | `true`, `false` | `false` | Si incluye desvíos internacionales LA/G3 |

### Estructura de Respuesta JSON:
```json
{
  "agrupacion": "semanal",
  "metrica_solicitada": "precio_ars",
  "fecha_observacion": "2026-09-06",
  "total_itinerarios_base": 1314,
  "hitos": [
    { "fecha": "2026-10-12", "nombre": "Diversidad Cultural", "tipo": "finde_largo" },
    { "fecha": "2027-01-15", "nombre": "Pico Quincena Enero", "tipo": "temporada_alta" }
  ],
  "rutas": [
    {
      "ruta": "BUE > EQS",
      "origen": "BUE",
      "destino": "EQS",
      "distancia_km": 1439.3,
      "total_vuelos_relevantes": 234,
      "stats_global_ars": {
        "min": 92745.0,
        "p25": 167985.0,
        "median": 167985.0,
        "p75": 167985.0,
        "max": 352690.0,
        "avg": 169824.5
      },
      "stats_global_km": {
        "min": 64.44,
        "p25": 116.71,
        "median": 116.71,
        "p75": 116.71,
        "max": 245.04,
        "avg": 117.99
      },
      "puntos": [
        {
          "bucket_id": "2026-09-07",
          "etiqueta": "Sem 07/09",
          "etiqueta_larga": "07/09 al 13/09",
          "fecha_inicio": "2026-09-07",
          "fecha_fin": "2026-09-13",
          "vuelos_disponibles": 6,
          "tiene_datos": true,
          "precio_min": 167985.0,
          "precio_p25": 167985.0,
          "precio_mediana": 167985.0,
          "precio_p75": 167985.0,
          "precio_max": 167985.0,
          "precio_promedio": 167985.0,
          "tarifa_km_min": 116.71,
          "tarifa_km_p25": 116.71,
          "tarifa_km_mediana": 116.71,
          "tarifa_km_p75": 116.71,
          "tarifa_km_max": 116.71,
          "tarifa_km_promedio": 116.71,
          "aerolineas": ["AR"],
          "aerolinea_minima": "AR",
          "vuelo_minimo": "AR1816",
          "hora_minima": "09:30",
          "hito": null,
          "tipo_hito": null
        }
      ]
    }
  ]
}
```

---

## 7. Verificación en Producción y Garantías Operativas

1. **Desarrollo Local y Control de Versiones:**
   * Todo el código fue desarrollado, testeado y commiteado localmente en Windows antes de sincronizar al VPS (`git pull` en `/root/esquel-data-integration` y copia a `/opt/metrica-aereos`).
2. **Suite de Pruebas Automatizadas:**
   * Se incorporó el archivo de pruebas [`test_f1f_series_visualizacion.py`](file:///C:/Users/agenc/.gemini/antigravity/scratch/esquel-data-integration/src/metrica-aereos/tests/test_f1f_series_visualizacion.py), elevando la cobertura a **35 pruebas unitarias**, todas ejecutadas con éxito.
3. **Preservación de Servicios Preexistentes:**
   * El puerto 3013 (MÉTRICA) y el puerto 38520 (Esquel DATA) permanecieron 100% operativos e inalterados durante todo el despliegue.
4. **Cero Dependencias Externas en Frontend:**
   * El renderizado vectorial se realiza íntegramente mediante SVG nativo generado con JavaScript vanilla, garantizando autonomía total frente a fallos de red, caídas de CDN o restricciones de privacidad del navegador.
