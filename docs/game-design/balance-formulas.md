# Esquel 2027 — Modelos matemáticos y fórmulas de balance

> **Estado:** PROMPT 0 · versión 1.0.0
> **Implementación de referencia:** [`/shared/util/balance.ts`](../../shared/util/balance.ts),
> [`/shared/util/debate.ts`](../../shared/util/debate.ts),
> [`/shared/util/territory.ts`](../../shared/util/territory.ts)
> **Tunables:** [`/shared/constants/balance.ts`](../../shared/constants/balance.ts)
> **Verificación:** `npm run check:balance` (falla el build si doc y código divergen)

Este documento es la referencia normativa del balance. Todo número que aparece acá
existe como constante en `/shared/constants/balance.ts`; ni el cliente ni el servidor
pueden inventar magic numbers de gameplay.

---

## §1. Principios de diseño

1. **El servidor es la única autoridad.** El cliente predice y previsualiza; el VPS
   calcula y persiste. Las mismas funciones de `/shared` corren en los dos lados,
   así que la previsualización nunca miente… salvo por el azar, que es determinista
   por semilla y reproducible.
2. **Rendimientos decrecientes en todo lo repetible.** Nada que se pueda automatizar
   debe rendir linealmente: ni pegar afiches, ni juntar gente en una esquina.
3. **La coordinación gana a la cantidad.** Es la tesis del juego: nueve militantes
   organizados valen más que catorce sueltos. La fórmula de territorio lo demuestra
   numéricamente (§4.6).
4. **El contexto real pesa.** Clima, hora local y noticias de Esquel modifican
   recompensas y participación. Militar con nieve rinde más porque cuesta más.
5. **Todo es auditable.** Cada recompensa emite su desglose (`breakdown`) y se
   persiste en `misiones_historial.multiplicadores`; cada duelo guarda su `seed` y su
   log completo. Sin eso, no se puede recalibrar.

**Notación**

| Símbolo | Significado |
|---|---|
| `n` | Nivel de rango, 1..10 |
| `⌊·⌉₂₅` | Redondeo al múltiplo de 25 más cercano |
| `c` | Completitud de misión, [0,1] |
| `P_f` | Presencia efectiva de la facción `f` en una zona |
| `S_f` | Puntaje territorial acumulado de la facción `f` |

---

## §2. Progresión: XP, rangos y reputación

### 2.1 Curva de experiencia

La XP necesaria para pasar del rango `n` al `n+1`:

```
ΔXP(n) = ⌊ 900 · n^1.6 · 1.18^(n-1) ⌉₂₅          para n ∈ [1,9]
XP_total(n) = Σ_{i=1}^{n-1} ΔXP(i)
```

El término polinómico `n^1.6` da el crecimiento sostenido de la mitad baja; el
término geométrico `1.18^(n-1)` hace que los últimos rangos sean un compromiso real
y no un trámite. El redondeo a 25 mantiene los números legibles en el HUD.

| Rango | Nombre | ΔXP al siguiente | XP acumulada | Rep. mín. | Lealtad mín. | ×XP | Peso territorial | Estipendio/día |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | Chopanero | 900 | 0 | 0 | 0.00 | 1.00 | 1.0 | — |
| 2 | Soldado | 3.225 | 900 | 30 | 0.35 | 1.06 | 1.3 | $150 |
| 3 | Puntero | 7.275 | 4.125 | 69 | 0.40 | 1.12 | 1.6 | $218 |
| 4 | Mano Derecha | 13.600 | 11.400 | 112 | 0.45 | 1.18 | 1.9 | $315 |
| 5 | Concejal | 22.925 | 25.000 | 158 | 0.50 | 1.24 | 2.2 | $457 |
| 6 | Director | 36.200 | 47.925 | 207 | 0.55 | 1.30 | 2.5 | $663 |
| 7 | Subsecretario | 54.675 | 84.125 | 258 | 0.60 | 1.36 | 2.8 | $961 |
| 8 | Secretario | 79.875 | 138.800 | 310 | 0.65 | 1.42 | 3.1 | $1.394 |
| 9 | Viceministro | 113.775 | 218.675 | 364 | 0.70 | 1.48 | 3.4 | $2.021 |
| 10 | Candidato Provincial | — | 332.450 | 419 | 0.75 | 1.54 | 3.7 | $2.931 |

### 2.2 Reputación y lealtad

```
Rep_mín(n) = round( 30 · (n-1)^1.2 )
```

La reputación tiene **techo blando**: subir cuesta más cuanto más alta está, pero
caer no tiene amortiguación.

```
Rep' = Rep + Δ · (1 - max(0, Rep)/1000)      si Δ > 0
Rep' = Rep + Δ                                si Δ ≤ 0
```

Decaimiento diario: `Rep ← round(Rep · 0.98)` — la fama del militante se olvida si no
se sostiene. La lealtad cae `0.008/día` sin conectarse y sube `0.012` por misión
cumplida para la propia facción. Cambiar de bando la resetea a `0.15` y aplica
7 días de penalización: los ascensos exigen lealtad, así que el turnismo cuesta caro.

### 2.3 Tiempo hasta el rango 10

Con un jugador medio que hace ~8 misiones por hora (≈2.000 XP/h base) y aplicando el
multiplicador de rango:

```
horas = Σ_{n=1}^{9} ΔXP(n) / (2000 · ×XP(n)) = 120,8 h
```

La ventana de diseño es **100–150 h**. `npm run check:balance` falla si la curva se
sale de ese rango — es la salvaguarda contra un retoque de constantes que arruine la
economía de tiempo sin que nadie lo note.

### 2.4 Recompensa de misión

```
XP  = round( base_XP · f_c · f_rep · f_cap · f_ctx · ×XP(n) · perk_facción · buff_XP )
Rep = round( base_Rep · f_c · f_rep · f_cap · buff_Rep )
$   = round( base_$   · f_c · f_rep · f_cap · buff_$ )
Territorio = base_T · f_c · peso_territorial(n)
```

| Factor | Fórmula | Para qué está |
|---|---|---|
| `f_c` (completitud) | `c^1.25` | Terminar rinde más que proporcional: desalienta abandonar al 60% |
| `f_rep` (repetición) | `max(0.25, 0.82^r)` con `r` = veces que ya hizo hoy esa tipología | Empuja a variar de misión |
| `f_cap` (tope diario) | `0.15` si superó el cupo del rango, si no `1` | Techo al farmeo |
| `f_ctx` (contexto) | `clima_outdoorXp · hora · (0.75 + 0.5·dificultad)` | El contexto real importa |

**Ejemplo real** (verificado por `check:balance`) — *Pegatina relámpago en Alvear*,
rango 1, dificultad 0.5, 18 h, despejado:

| Escenario | XP |
|---|---:|
| Completada al 100%, primera del día | **273** |
| Completada al 50% | **115** (42% de la anterior, no 50%) |
| 13ª repetición del día, con 30 misiones hechas | **10** (3,7%) |

### 2.5 Vitales derivados

```
Salud_máx(n) = 100 + 4·(n-1)
Tope de guita(n) = 5.000.000 · 1,6^(n-1) centavos
```

---

## §3. Duelos de Debate y Chicana

### 3.1 Recursos

| Recurso | Rol | Fórmula inicial |
|---|---|---|
| **Credibilidad** | Vida | `120 + 14·(n-1) + 0,05·Rep` |
| **Retórica** | Ataque | `20 + 3,5·(n-1)` |
| **Argumentos** ("aire") | Maná | Empieza en 4, +2 por turno, tope 10 |
| **Favor del público** | Defensa contextual | 0,5 por lado ± reputación y espectadores |

| Rango | Credibilidad (con rep. típica) | Retórica |
|---:|---:|---:|
| 1 | 122 | 20,0 |
| 3 | 154 | 27,0 |
| 5 | 186 | 34,0 |
| 7 | 218 | 41,0 |
| 10 | 266 | 51,5 |

### 3.2 Rueda de familias

Ocho familias, cada una contrarresta a dos. No hay familia dominante: la ventaja
depende de lo que jugó el rival **el turno anterior**, así que el duelo es lectura,
no memoria de una tabla.

| Familia | Contrarresta a |
|---|---|
| Chicana | Promesa Inviable, Empatía Vecinal |
| Archivo Histórico | Chicana, Invocar al Líder |
| Promesa Inviable | Dato Duro, Defensa |
| Chanchullo | Archivo Histórico, Dato Duro |
| Invocar al Líder | Chanchullo, Promesa Inviable |
| Dato Duro | Chicana, Archivo Histórico |
| Empatía Vecinal | Chanchullo, Invocar al Líder |
| Defensa | Chicana, Chanchullo |

```
counter(a, d) = 1,50   si a contrarresta a d
                0,65   si d contrarresta a a
                1,00   en otro caso
```

### 3.3 Resolución de una jugada

```
precisión = clamp( carta.precisión · (1,10 si hay contra) − 0,15 · favor_público(defensor), 0,15 , 0,99 )
impacta   = rng() < precisión
```

Si impacta:

```
daño = carta.poder
     · (1 + retórica/60)
     · counter
     · (1,10 si hay afinidad de facción)
     · (1 − 0,35 · favor_público(defensor))
     · (1 − escudo)
```

Si falla:

```
daño_propio = 0,60 · carta.poder   si hubo contragolpe (prob. carta.backfire)
              3                    si sólo erró
favor_público → se corre hacia el rival (−0,03 o −0,09 con contragolpe)
```

Cada impacto corre el favor del público `0,06 · counter` hacia el atacante. El
público no es decorado: amortigua el daño que recibe su favorito hasta un 35%.

### 3.4 Estructura del turno

- 30 s por turno. Vencido el plazo, se pasa automáticamente (`timedOut`).
- Mazo de 12 cartas, mano de 4, máximo 12 turnos.
- Cierre por credibilidad ≤ 0, por agotar turnos (gana quien conserva más
  credibilidad porcentual; empate técnico si la diferencia es < 5%), por abandono o
  por desconexión.

### 3.5 Recompensas

```
dominancia = clamp( 0,65 · (credibilidad_restante/máxima) + 0,35 · velocidad , 0, 1 )
velocidad  = 1 − clamp( (turnos − 3) / 9 , 0, 1 )
rank_factor = clamp( 1 + 0,12 · (rango_perdedor − rango_ganador) , 0,4 , 1,9 )

XP_ganador  = round( 320 · (0,70 + 0,60·dominancia) · rank_factor )
XP_perdedor = round(  90 · (1,30 − 0,50·dominancia) )
Rep_ganador = round(  12 · rank_factor · (0,60 + 0,80·dominancia) )
Rep_perdedor= −6  (−12 si abandonó)
```

Ganarle a alguien de rango mayor rinde hasta 1,9×; ganarle a un novato, 0,4×. El
matchmaking de esquina admite una diferencia máxima de **3 rangos**
(`DEBATE.MAX_RANK_GAP`), justamente para que el rango 10 no vaya a cazar chopaneros.

### 3.6 Duración esperada

Con `RHET_SCALE = 60`, un rango 5 (credibilidad 186) recibe ~39 de daño por impacto
medio (carta de poder 26 con contra leve): **5 impactos** para caer. Sumando fallos
(precisión ~0,88) y turnos de recarga de argumentos, el duelo típico cierra entre el
**turno 6 y el 9**. El peor caso posible —rango 10 con contra y afinidad contra un
rango 1— pega 46: nunca hay one-shot, y `check:balance` lo verifica en cada build.

---

## §4. Control territorial y movilizaciones

### 4.1 Presencia individual

```
w_i = peso_territorial(rango_i) · (1 − 0,5·(d_i/R)²)        si d_i ≤ R y no está AFK
w_i = 0                                                     en otro caso
```

`R` = 45 m (radio de zona). La caída cuadrática premia estar **en** la esquina, no
enfrente. AFK > 180 s deja de sumar: no se puede tomar territorio dejando el
navegador abierto.

### 4.2 Presencia efectiva de la facción

```
raw_f       = Σ_i w_i                     (tope: 40 militantes por facción)
saturado_f  = raw_f^0,75
cohesión_f  = fracción de militantes dentro de 18 m del centro
voz_f       = fracción transmitiendo por voz espacial

P_f = saturado_f
    · (1 + 0,35 · cohesión_f)
    · (1 + 0,12 · voz_f)
    · turnout_clima
    · perk_facción
    · (1,15 si defiende la zona)
```

El exponente 0,75 es el corazón del modelo: **duplicar la gente multiplica la
presencia por 1,68, no por 2**. Sumar el militante número 30 aporta menos que el
número 3. Es lo que hace que valga más organizar que amontonar.

### 4.3 Acumulación y decaimiento

Cada tick de 10 s:

```
S_f ← max( 0 , S_f · (1 − 0,06·Δt/60) + 1,0 · P_f )
```

El decaimiento se aplica **siempre**, también a quien está presente: sostener una
esquina es trabajo continuo, no una bandera clavada.

### 4.4 Captura

```
share_f = S_f / Σ_g S_g
captura si share_líder ≥ 0,60 y el líder no es quien ya controlaba
```

El 60% evita que una zona cambie de manos por un empate técnico.

### 4.5 Conversión a intención de voto

```
Δapoyo_f = 0,004 · peso_zona · share_f
```

Con la Plaza San Martín (peso 3,0) dominada al 100%, la facción gana 1,2 puntos de
apoyo simulado por corte. El apoyo simulado **no** se mezcla nunca con la intención
de voto declarada del motor de inteligencia (§ [privacidad](../architecture/privacidad-telemetria.md)):
son dos series separadas, una del juego y otra de las respuestas de los jugadores.

### 4.6 Ejemplo verificado

| Escenario | Militantes | Disposición | Presencia efectiva |
|---|---:|---|---:|
| Amontonados | 14 (rango 3) | dispersos a 40 m del centro, sin voz | **7,06** |
| Organizados | 9 (rango 3) | a 10 m del centro, cantando por voz | **10,97** |

Nueve coordinados le ganan a catorce dispersos por 55%. `check:balance` falla si
alguna vez deja de ser cierto.

---

## §5. Clima, hora y contexto

Multiplicadores por condición (extracto; tabla completa en `WEATHER_MODIFIERS`):

| Condición | Velocidad | Convocatoria | Vida del afiche | XP al aire libre |
|---|---:|---:|---:|---:|
| Despejado | 1,00 | 1,00 | 1,00 | 1,00 |
| Llovizna | 0,97 | 0,82 | 0,70 | 1,10 |
| Lluvia | 0,93 | 0,70 | 0,45 | 1,20 |
| Nieve | 0,82 | 0,60 | 0,55 | 1,35 |
| Viento fuerte (> 70 km/h) | 0,90 | 0,68 | 0,50 | 1,25 |
| Tormenta | 0,88 | 0,45 | 0,30 | 1,45 |

La curva horaria (`HOUR_ACTIVITY_MULTIPLIER`) tiene su pico a las 18-19 h y su piso
entre las 2 y las 5 de la mañana. Un afiche pegado bajo la lluvia dura menos de la
mitad, pero la misión rinde 20% más XP: el mal tiempo es riesgo y oportunidad.

---

## §6. Economía

- Guita inicial: **$2.500** (250.000 centavos).
- Tope en mano: `5.000.000 · 1,6^(n-1)` centavos, para que la guita circule.
- La facción se queda con el **10%** de toda recompensa monetaria (`FACTION_CUT`),
  que va al tesoro y financia movilizaciones y spots.
- Sumideros previstos: consumibles (afiches, volantes, leña), reparación de
  herramientas, apuestas de esquina y aportes voluntarios a la caja de campaña.
- Inflación desactivada por defecto (`DAILY_INFLATION = 0`): se activa sólo si la
  telemetría muestra acumulación descontrolada.

---

## §7. Verificación automática

`npm run check:balance` corre en CI y valida:

1. Que `RANKS` coincida exactamente con la curva y con el seed SQL de `rangos`.
2. Que `rankFromXp` sea consistente en cada borde de rango.
3. Que el tiempo a rango 10 caiga en la ventana 100–150 h.
4. Que la completitud parcial rinda **menos** que proporcional.
5. Que el farmeo caiga por debajo del 10% de la recompensa base.
6. Que ninguna carta pueda liquidar un duelo de un golpe.
7. Que la coordinación le gane a la cantidad en territorio.

Salida actual:

```
· Tiempo a rango 10: 120.8 h efectivas (ventana de diseño: 100-150 h)
· Afiches relámpago: 273 XP al 100%, 115 XP al 50%, 10 XP farmeando.
· Daño máximo observado (rango 10 con contra + afinidad vs rango 1): 46
· Territorio — 14 dispersos: 7.063 · 9 coordinados con voz: 10.969
✓ Fórmulas, tablas y seeds coherentes.
```

---

## §8. Plan de recalibración

Los valores de arriba son **hipótesis de diseño**, no verdades reveladas. La tabla
`ascensos` y la vista `v_balance_misiones` existen para desmentirlas con datos:

| Métrica observada | Fuente | Acción si se desvía |
|---|---|---|
| Horas reales por rango | `ascensos` | Ajustar `XP_CURVE.GROWTH` (±0,02 por iteración) |
| Abandono por tipología | `v_balance_misiones.abandonos` | Bajar dificultad o subir `base_XP` de esa tipología |
| Duración media de duelos | `duelos_debate.turnos` | Mover `RHET_SCALE` (objetivo: mediana 7 turnos) |
| Tasa de captura de zonas | `movilizaciones.resultado` | Ajustar `CAPTURE_THRESHOLD` y `DEFENDER_ADVANTAGE` |
| Guita media en mano | `personajes.guita_centavos` | Activar sumideros antes que tocar recompensas |

Regla de oro: **un tunable por iteración, una semana de observación**. Cambiar tres
constantes a la vez hace imposible saber cuál funcionó.
