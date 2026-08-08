# Metodología

Cómo se construye cada indicador del tablero, con las reglas de publicación y
los controles que se corren en cada actualización.

---

## 1. El dato de origen

La planilla del Observatorio tiene un grano atómico:
**un establecimiento, un día**. La hoja `Histórico - Datos Limpios` trae 44.014
registros para el período 1/1/2026 – 30/7/2026 (235 establecimientos × 205 días).

| Columna | Significado |
|---|---|
| `Capacidad UF` / `Capacidad PAX` | Parque **habilitado**: lo declarado en el registro de prestadores |
| `UF Disponible` / `PAX Disponible` | Parque **en operación**: lo efectivamente abierto ese día |
| `UF Ocupada` / `PAX Ocupada` | Lo vendido, según lo que informó el establecimiento |
| `Relevado` | Si el equipo logró contacto ese día |
| `Estado` | Anotación libre del relevador |

UF = unidad funcional (habitación, cabaña, departamento). PAX = plaza / cama.

---

## 2. Quién entra en la muestra

Un establecimiento cuenta como **con dato** en un día si se cumple cualquiera de
las dos condiciones:

```
con_dato  =  Relevado = "Sí"   OR   UF Ocupada > 0   OR   PAX Ocupada > 0
```

La segunda condición no es un capricho. La bandera `Relevado` se completa a mano
y se olvida: *Esquel Apart* y *Esquel Apart Duplex* aparecen el 14/01 con
`Relevado = No`, estado «Disponible» y 6 y 3 unidades ocupadas respectivamente.
Son dato. La hoja `Histórico - Ocupación Oficial` de la planilla también los
cuenta —su columna «Establecimientos con Datos» da 19 ese día, no 17—, así que
esta definición además es la que reproduce la serie oficial.

El tablero informa por separado cuántos casos hay de bandera mal cargada, en la
sección **Calidad del dato**.

---

## 3. Extrapolación

Para cada día y cada **estrato de relevamiento**:

```
tasa_uf   =   Σ UF Ocupada     (solo establecimientos con dato)
              ────────────────────────────────────────────────
              Σ UF Disponible  (solo establecimientos con dato)

UF ocupada estimada  =  tasa_uf  ×  UF Disponible del estrato completo
```

Es decir: se mide la tasa entre los que respondieron, ponderada por su tamaño
—un hotel de 50 unidades pesa más que una cabaña de 2—, y se proyecta al parque
que efectivamente opera.

### Por qué "estrato" y no "categoría"

El relevamiento desdobla algunas categorías en dos listas. `CABAÑAS` y
`CABAÑAS 2` son la misma categoría publicada, pero se releva cada una por
separado. La extrapolación se hace **por lista**, y recién después se suman las
unidades ocupadas estimadas:

```
UF ocupada (CABAÑAS)  =  tasa(CABAÑAS) × parque(CABAÑAS)
                      +  tasa(CABAÑAS 2) × parque(CABAÑAS 2)
```

Sin estratificar, una sublista chica y muy respondida arrastra a una grande y
poco respondida. Con datos reales la diferencia no es teórica: usando la tasa
combinada, la reconciliación contra la planilla se aleja el doble.

---

## 4. Reglas de publicación

Un indicador se publica solo si pasa los tres filtros.

### 4.1 Mínimo muestral por categoría

Cada categoría exige una cantidad mínima de establecimientos con dato en el día.
Los valores están en `etl/config/categorias.json`:

| Categoría | Mínimo | Categoría | Mínimo |
|---|---|---|---|
| Hoteles | 3 | Cabañas | 14 |
| Apart hoteles | 1 | Departamentos | 5 |
| Hosterías | 4 | Complejo alq. temporario | 14 |
| Bed & Breakfast | 2 | Vivienda turística | 6 |
| Hostels | 3 | Hospedaje complementario | 12 |
| Alojamiento familiar | 2 | Camping / Montaña / Refugios | 1 |

Por debajo del mínimo, el ETL **calcula igual la estimación** —queda disponible
para el panel de calidad— pero la marca como no publicable, y el tablero la
dibuja como hueco.

### 4.2 Mínimo de categorías para el total del destino

El total se publica si al menos **3 categorías** tienen dato ese día
(`min_categorias_general` en `etl/config/parametros.json`). Con el período
actual, eso deja **60 de 205 días** publicables.

### 4.3 Sin dato no es cero

Es la regla que gobierna toda la presentación. Una serie con hueco significa que
no se midió; una serie en cero significa que se midió y no hubo ocupación. El
tablero nunca convierte lo primero en lo segundo.

---

## 5. Agregación de porcentajes

**Nunca se promedian ni se suman porcentajes.** Para cualquier período o
agrupamiento:

```
% ocupación  =  Σ unidades ocupadas estimadas  (celdas publicables)
                ─────────────────────────────────────────────────
                Σ unidades en operación        (celdas publicables)
```

Promediar porcentajes le da el mismo peso a un día con 3 unidades que a uno con
3.000. Sumarlos produce las cifras superiores al 100 % que hoy muestra el
gráfico «Total ocupación por categoría» del tablero de Looker (Vivienda
Turística: 163 %).

El mismo criterio se aplica al parque: primero se consolida **por día** y
después se promedia. Agregarlo de una sola pasada sobre (fecha × categoría) da
el tamaño de una categoría cualquiera, no el del destino.

---

## 6. Demanda

```
pernoctes medidos     =  Σ plazas ocupadas estimadas de los días publicables
pernoctes proyectados =  tasa observada × plazas-noche de todo el período
turistas              =  pernoctes ÷ estadía promedio
derrame estimado      =  pernoctes proyectados × gasto diario por turista
```

El tablero muestra **las dos lecturas de pernoctes**, no una. La medida
subestima, porque solo suma los días con relevamiento; la proyectada asume que
los días no medidos se comportaron como los medidos. La franja entre ambas es el
margen de incertidumbre real, y crece cuando cae la cobertura.

La estadía promedio viene del relevamiento de la oficina de informes (hoja
`Pasajeros`); si falta para un mes, se usa el valor por defecto configurado.

El **derrame es paramétrico**: `gasto_diario_por_turista` en
`etl/config/parametros.json`. No es un dato relevado y el tablero lo aclara cada
vez que lo muestra. Debe reemplazarse por el valor de la EVyTH o de un
relevamiento propio.

---

## 7. Normalización de estados

La columna `Estado` acumula 282 variantes de texto libre («wsp», «Wsp», «w»,
«dis », «hay lugar», «Cerrado/H nuevo aviso»…). Se clasifican con reglas
explícitas en `etl/oit/normalize.py`, agrupadas en cinco familias:

| Familia | Incluye |
|---|---|
| **Con respuesta** | Completo, Con disponibilidad, Ocupación parcial |
| **Sin respuesta** | Contactado sin respuesta, Pendiente de gestión |
| **Fuera de operación** | Baja, Cerrado temporalmente, No es alojamiento |
| **Sin gestión** | Celda vacía |
| **Sin clasificar** | Lo que ninguna regla captura |

El ETL informa en cada corrida las variantes que quedaron sin clasificar, con su
frecuencia, para que las reglas se amplíen con evidencia en vez de a ciegas.
Actualmente quedan 40 variantes sin capturar («Preguntado», «Ocupado»,
«disponibles», «Solo llamadas»…).

---

## 8. Reconciliación con la planilla

En cada corrida el ETL compara, fila por fila, sus resultados contra la hoja
`Histórico - Ocupación Oficial`, sobre los 2.870 pares categoría-día.

Estado actual: **dentro del umbral**, con un residuo máximo del 3,2 % de las
filas. Las diferencias están concentradas, no dispersas:

| Indicador | Filas distintas | Dónde se concentran |
|---|---|---|
| UF habilitada | 57 (2,0 %) | Vivienda turística / mayo, Hostels / julio |
| UF trabajando | 30 (1,0 %) | Vivienda turística / mayo |
| Establecimientos con dato | 20 (0,7 %) | Vivienda turística / mayo y julio |
| UF ocupada extrapolada | 73 (2,5 %) | Vivienda turística / julio, Cabañas / enero |
| PAX ocupada extrapolada | 93 (3,2 %) | ídem |

Que caigan en dos categorías y dos meses específicos —y no repartidas— indica
desactualización puntual de la planilla: la hoja oficial se recalcula a mano y
queda vieja cuando se da de alta o de baja un establecimiento. Una divergencia
difusa, en cambio, indicaría un error de método; por eso el umbral es sobre la
*proporción* de filas y el proceso **aborta** si se supera.

El detalle de la última reconciliación se ve en la sección **Metodología** del
tablero, y queda registrado en `meta.json`.

---

## 9. Modelo de datos

| Tabla | Grano | Filas |
|---|---|---|
| `fact_establecimiento_dia` | establecimiento × día | 44.014 |
| `fact_categoria_dia` | categoría × día | 2.870 |
| `fact_dia` | día | 205 |
| `fact_mes_quincena` | mes × quincena | 14 |
| `fact_mes` | mes | 7 |
| `dim_calendario` | día del año | 365 |
| `dim_categoria` | categoría | 14 |
| `dim_alojamiento` | establecimiento | 235 |
| `dim_evento` | fin de semana largo | 11 |

`fact_dia` conserva dos series en paralelo: la **oficial** (solo categorías que
alcanzan el mínimo) y la **general** (cualquier categoría con dato). La segunda
es la que reproduce el tablero anterior; se mantiene para no perder continuidad
con lo ya publicado, pero la lectura defendible es la primera. La sección
Metodología del tablero muestra las dos lado a lado.
