# Elecciones 2027 — la mecánica de end-game

> **Estado:** Fase 1 · implementado en `/shared/{types,constants,util}/election.ts`
> y en el widget `client/src/ui/widgets/ElectionWidget.tsx`

Todo el juego corre hacia una fecha: **los comicios municipales de Esquel 2027**.
No es un evento de temporada: es el final del ciclo. El contador está siempre a la
vista en el HUD, arriba a la derecha, marcando días, horas, minutos y segundos.

## La fecha

Todavía no hay convocatoria oficial, así que el sistema arranca con una estimación
dentro de la ventana abril-agosto: **domingo 13 de junio de 2027, 08:00** hora de
Esquel. Está marcada como estimada (`ELECTION_CALENDAR.estimated`) y el HUD lo
aclara: *«Fecha estimada · sujeta a convocatoria oficial»*.

Cuando salga la fecha real se cambia en un solo lugar —`ELECTION_DAY_ISO` en
`/shared/constants/election.ts`, o `VITE_ELECTION_DAY` para probar— y se reacomodan
solos el contador, las fases y los multiplicadores.

## Las cinco fases

| Fase | Cuándo | Qué pasa |
|---|---|---|
| `PRE_CAMPAIGN` | hasta 45 días antes | El juego de todos los días: militancia, territorio, rosca de barrio |
| `OFFICIAL_CAMPAIGN` | 45 días antes → 48 h antes | **Temporada alta**: +25% XP, +35% territorio, 60% más de misiones |
| `VEDA` | 48 h antes → cierre de urnas | Se apaga la propaganda y no se publican encuestas. La ciudad en silencio |
| `ELECTION_DAY` | 08:00 → 18:00 del domingo | Urnas abiertas. Todo rinde 1,5× y se vota de verdad |
| `POST_ELECTION` | después del cierre | Escrutinio, resultados y apertura de la temporada siguiente |

Los multiplicadores exactos están en `ELECTION_MODIFIERS`; el HUD muestra la fase
como badge (`Campaña Abierta`, `Veda Electoral`, `¡Se vota!`).

## Cómo lo consume el resto del sistema

```ts
import { buildElectionState } from '@esquel/shared';

const election = buildElectionState(Date.now());
election.phase                    // 'OFFICIAL_CAMPAIGN'
election.badge                    // 'Campaña Abierta'
election.countdown.days           // 128
election.modifiers.questXp        // 1.25
election.modifiers.propagandaAllowed // false durante la veda
```

- **Servidor (Fase 2)**: calcula la fase en cada tick y la replica dentro de
  `WorldState.election`. Es la autoridad.
- **Cliente**: recalcula el contador localmente cada segundo para que lata suave
  entre patches, sin pedirle nada al servidor.
- **Live-Ops**: `questSpawnRate` y `propagandaAllowed` condicionan qué misiones se
  publican; durante la veda desaparecen las de afiches y volanteada.
- **Inteligencia**: `pollsPublishable` corta la publicación de cortes de intención
  de voto mientras dura la veda.

## Qué falta (Fase 2 en adelante)

- Urnas físicas en la Plaza San Martín y en las escuelas del mapa, habilitadas sólo
  con `votingOpen`.
- Escrutinio en vivo la noche del comicio, con resultados por barrio.
- Cierre de temporada: prestigio, reinicio de rangos y arranque del ciclo siguiente.
