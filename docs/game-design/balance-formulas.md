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

> Actualizado en la Fase 3. Los números salen de `DEBATE` en
> `/shared/constants/balance.ts`; la implementación de referencia es
> `/shared/util/debate.ts` y el motor autoritativo `/server-vps/src/debate/DebateEngine.ts`.
> Nada de acá está estimado: la duración y la dominancia por carta las mide
> `npm run test:debate --workspace server-vps` jugando cientos de duelos completos.

### 3.1 Recursos

| Recurso | Rol | Fórmula |
|---|---|---|
| **Credibilidad** | Vida | `100 + 13,89·(n−1) + min(0,025·Rep, 25)` |
| **Retórica** | Ataque | `20 + 3,5·(n−1)` |
| **Labia** | Maná | Empieza en 5, +3 por turno, tope 12 (+2 extra si pasás) |
| **Favor del público** | Defensa contextual | 0,5 por lado ± reputación y espectadores |

| Rango | Credibilidad (rep. 0) | Credibilidad (rep. 1000) | Retórica |
|---:|---:|---:|---:|
| 1 | 100 | 125 | 20,0 |
| 3 | 128 | 153 | 27,0 |
| 5 | 156 | 181 | 34,0 |
| 7 | 183 | 208 | 41,0 |
| 10 | 225 | **250** | 51,5 |

El techo de diseño son 250 y se alcanza sólo siendo Candidato Provincial **y** con
nombre hecho: el rango pone 225, la fama los últimos 25. `check:balance` falla si
el rango 1 no arranca exacto en 100 o si el rango 10 se pasa de 250.

El tope de labia (12) no se alcanza guardándose turnos: en seis turnos sin gastar
se acumularían 23. Eso es deliberado — pasar tiene costo de oportunidad, y
`check:balance` verifica que el tope siga siendo alcanzable.

### 3.2 Rueda de familias

**Seis** familias. Cada una contrarresta a una o dos, y ninguna es dominante: la
ventaja depende de lo que jugó el rival **el turno anterior**, así que el duelo es
lectura, no memoria de una tabla.

| Familia | Contrarresta a | Qué es |
|---|---|---|
| **Chicana** | Promesa Inviable | La cargada de esquina |
| **Carpetazo** | Invocar al Líder | El archivo que aparece justo |
| **Promesa Inviable** | Chanchullo | El asfalto para todos |
| **Romper Quórum** | Carpetazo, Invocar al Líder | Si no hay número, no hay sesión |
| **Chanchullo** | Romper Quórum | La licitación con tres primos |
| **Invocar al Líder** | Chicana, Chanchullo | La foto con el jefe |

```
familia(a, d) = 1,40   si a contrarresta a d
                0,75   si d contrarresta a a
                1,00   en otro caso
```

**Carpetazo no cuenta a Promesa Inviable entre sus contras.** El carpetazo ya
castiga la mentira por su condicional (§3.3): sumarle además el multiplicador de
familia lo volvía la carta obligatoria del meta. Se probó, se midió, se sacó.

### 3.3 Resolución de una jugada

```
precisión = clamp( carta.precisión · (1,10 si hay contra) − 0,15 · favor_público(defensor), 0,15 , 0,99 )
impacta   = rng() < precisión
```

Si impacta:

```
daño = (carta.poder + 8)                     ← DAMAGE_FLOOR comprime barata vs. épica
     · (1 + retórica/48)                     ← RHET_SCALE
     · familia                               ← 1,40 / 0,75 / 1,00
     · condición                             ← ver abajo
     · (1,10 si hay afinidad de facción)
     · zona                                  ← sólo INVOCAR_AL_LIDER
     · (1 − 0,25 · favor_público(defensor))
     · (1 − escudo)
```

**Condición** — dos familias no pegan siempre igual:

| Situación | Multiplicador |
|---|---:|
| Carpetazo y el rival prometió el turno anterior | **1,60** |
| Carpetazo sin mentira que aprovechar | **0,45** |
| Invocar al Líder sin control de la zona | **0,80** |
| Invocar al Líder con la zona bajo control de tu facción | **1,50** |

El `DAMAGE_FLOOR = 8` es la corrección que hizo jugable el mazo: sin él, la
diferencia entre una chicana de poder 11 y un bombazo de 32 era tan grande que
armar mazo dejaba de ser una decisión y pasaba a ser una lista de compras.

Si falla:

```
daño_propio = 0,50 · carta.poder   si hubo contragolpe (prob. carta.backfire)
              3                    si sólo erró (MISS_CRED_PENALTY)
```

Cada impacto corre el favor del público `0,05` hacia el atacante, hasta un tope de
±0,15 por espectadores. El público no es decorado: amortigua hasta un 25% del daño
que recibe su favorito.

### 3.4 Estructura del turno

- Un **turno** son las dos jugadas: el retador y el defensor.
- 30 s por lado; vencido el plazo se pasa solo (`timedOut`).
- Mazo de 12, mano de 4, máximo 12 turnos. Al final de cada turno se aplica el
  sangrado, se reparten +3 de labia, bajan los cooldowns y se repone la mano
  (rebarajando el descarte si hace falta).
- Cierre por credibilidad ≤ 0, por agotar turnos (gana quien conserva más
  credibilidad **porcentual**; empate técnico si la diferencia es < 5%), por
  abandono o por desconexión.
- El desafío de esquina exige facción rival, ≤ 18 m de distancia y una diferencia
  de rango ≤ 3 (`DEBATE.MAX_RANK_GAP`): el rango 10 no va a cazar chopaneros.

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

Ganarle a alguien de rango mayor rinde hasta 1,9×; ganarle a un novato, 0,4×.

### 3.6 Duración medida

No es una estimación: `npm run test:debate --workspace server-vps` juega duelos
completos con bots codiciosos y mazos legales al azar, y falla si el promedio se
sale de la ventana 6–9 o si alguna carta con ≥ 20 duelos jugados tiene el **piso
del intervalo de confianza del 95% (Wilson)** por encima del 65% de victorias.

| Duelos | Promedio | Mediana | Rango | Carta dominante |
|---:|---:|---:|---:|---|
| 100 | 8,05 | 8 | 3–13 | ninguna |
| 400 | 7,92 | 7 | 2–13 | ninguna |
| 800 | 8,39 | 8 | 2–13 | ninguna |

De 400 duelos: 345 cerraron por credibilidad, 41 por agotar turnos y 14 fueron
empate técnico.

**Cómo se llegó acá** (todo medido, nada supuesto):

1. `CARPETAZO` duplicaba castigo — condicional 2,3 **más** contra de familia contra
   Promesa. Se le sacó Promesa de la rueda y el condicional bajó 2,3 → 1,75 → 1,60.
2. Los duelos se estiraban: `RHET_SCALE` 60 → 36 → **48**, con `DAMAGE_FLOOR` 6 → **8**
   para comprimir la brecha entre cartas baratas y épicas.
3. Se recortaron las cartas que ganaban solas: `la_captura_guardada` 28 → 22 (sangrado
   3 → 2), `el_audio_que_circula` 34 → 20, `vino_el_ministro` 24 → 17 (sin cura),
   `el_dedo_del_dedo` 32 → 27, `sobreprecio_en_la_obra` 12 → 10.
4. Se subieron las curas de las promesas (16 → 21 y 12 → 16) para que la familia
   defensiva tuviera con qué.

---

## §4. Control territorial y movilizaciones

### 4.1 Presencia individual

```
w_i = Rango_i^0,75 · (1 − 0,5·(d_i/R)²)        si d_i ≤ R y no está AFK
w_i = 0                                        en otro caso
```

`R` es el radio de la zona (38 a 60 m según cuál: la Plaza es grande, Alvear y 25
es una esquina). La caída cuadrática premia estar **en** la esquina, no enfrente.
AFK > 180 s deja de sumar: no se toma territorio dejando el navegador abierto.

El exponente 0,75 es el corazón del modelo y se aplica **al rango de cada uno**, no
a la suma: un Concejal (rango 5) aporta 3,34 y un Chopanero (rango 1) aporta 1.
Pesa más, pero no arrasa — la calle la hacen los que están, no los cargos.

### 4.2 Presencia efectiva de la facción

```
PoderZona(F) = Σ_{i∈F} ( Rango_i^0,75 · caída_i )      (tope: 40 militantes)
             · (1 + 0,35 · cohesión_F)                 ← CohesionBonus
             · (1 + 0,12 · voz_F)                      ← VoiceBonus
             · turnout_clima
             · perk_facción
             · (1,15 si ya defiende la zona)
```

donde `cohesión_F` es la fracción de militantes dentro de 18 m del centro y `voz_F`
la fracción que está transmitiendo por voz espacial en ese tick. Las dos son
propiedades **del grupo**, así que multiplican la suma entera: es la diferencia
entre veinte personas desparramadas y quince apretadas cantando lo mismo.

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
captura si share_líder ≥ 0,60 sostenido durante 300 s (cinco minutos)
```

El 60% evita que una zona cambie de manos por un empate técnico, y los cinco
minutos de aguante evitan que la cambie una corrida de treinta segundos. El
`TerritoryManager` mide las cinco zonas cada 10 s y va acumulando `holdSeconds`
mientras el líder se sostiene; si baja del umbral, el contador se reinicia. Cuando
llega a 300 emite `captura`, se plantan las banderas y los afiliados a esa facción
pasan a cobrar ×1,15 de XP y ×1,12 de guita mientras la aguanten.

Las cinco zonas en disputa (`TERRITORY_ZONE_SEEDS`):

| Zona | Barrio | Centro (x, z) | Radio | Peso |
|---|---|---:|---:|---:|
| Plaza San Martín | centro | (0, 0) | 55 m | 3,0 |
| Explanada de la Municipalidad | centro | (−62, 0) | 42 m | 2,6 |
| Estación La Trochita | estación | (−400, 292) | 48 m | 2,4 |
| Alvear y 25 de Mayo | centro | (60, −60) | 38 m | 2,8 |
| Acceso La Zeta — Badén | badenes | (−720, 60) | 60 m | 2,0 |

El control de zona además alimenta a `INVOCAR_AL_LIDER` en los duelos (§3.3): con
la esquina bajo control de tu facción, la foto con el jefe pega ×1,50; sin ella,
×0,80.

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
| Amontonados | 14 (rango 3) | dispersos a 40 m del centro, sin voz | **19,31** |
| Organizados | 9 (rango 3) | a 10 m del centro, cantando por voz | **30,25** |

Nueve coordinados le ganan a catorce dispersos por 57%. `check:balance` falla si
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
6. Que la credibilidad respete el rango de diseño (100 exacto en rango 1, ≤ 250 en
   rango 10) y que el tope de labia siga siendo alcanzable.
7. Que los seeds 004 y 005 no tengan familias ni tipologías fuera del diseño.
8. Que la coordinación le gane a la cantidad en territorio.

La mecánica fina del duelo —duración y dominancia de cada carta— la verifica
`npm run test:debate --workspace server-vps`, que juega cientos de duelos completos
en vez de razonar sobre un caso peor teórico.

Salida actual:

```
· Tiempo a rango 10: 120.8 h efectivas (ventana de diseño: 100-150 h)
· Afiches relámpago: 273 XP al 100%, 115 XP al 50%, 10 XP farmeando.
· Credibilidad: rango 1 → 100 · rango 10 → 250 (diseño: 100 a 250)
· Labia acumulable en seis turnos sin gastar: 23 (tope 12)
· Seed de cartas: 24 cartas en 6 familias.
· Seed de misiones: 10 tipologías Live-Ops.
· Territorio — 14 dispersos: 19.305 · 9 coordinados con voz: 30.254
✓ Fórmulas, tablas y seeds coherentes.
```

```
— simulación de 400 duelos de chicanas —
  Duración: promedio 7.92 turnos · mediana 7 · rango 2-13
  Cierre: 345 por credibilidad · 41 por agotar turnos · 14 empates técnicos
✓ Duración dentro de la ventana y ninguna carta domina el meta.
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
