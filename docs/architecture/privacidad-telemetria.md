# Telemetría: cómo se toma el pulso de Esquel

> **Estado:** actualizado en la Fase 1 · versión operativa, sin ceremonia
> Contrato técnico: [`/shared/types/telemetry.ts`](../../shared/types/telemetry.ts)

El motor de inteligencia mide sentimiento e intención de voto por **barrio y franja
etaria**. Es una de las patas del proyecto y funciona rápido y directo: el cliente
manda lotes de eventos, el backend los agrega todas las noches y el dashboard los
muestra. Nada de fricción.

## Qué se mide

| Categoría | Ejemplos | Para qué |
|---|---|---|
| `sistema` | FPS, tiempo de carga, errores | que el juego ande |
| `sesion` | alta, duración, retención | salud del producto |
| `movimiento` | entrada a manzana, permanencia en un punto | mapa de calor urbano |
| `progresion` | misiones, ascensos, duelos | recalibrar el balance |
| `economia` | compras, sumideros | economía del juego |
| `politico` | intención de voto, prioridad de temas, reacción a noticias | el producto de inteligencia |
| `comercial` | impresiones y conversiones de sponsors | reporte al comercio |

La categoría `politico` sale siempre de una **acción explícita**: la urna de la
plaza, la encuesta de la misión de censo, la reacción declarada a una noticia. La
facción con la que alguien juega no se cuenta como voto: son dos series distintas y
se publican por separado (`facciones.apoyo` es juego; `intencion_voto_diaria` es
respuesta declarada).

## Cuatro decisiones técnicas que ya están en el código

1. **Seudónimo en lugar de identidad.** El sujeto de cada evento es
   `HMAC-SHA256(usuario_id, sal)`; la sal rota cada 30 días. Es lo que permite
   contar personas distintas sin arrastrar quién es cada una.
2. **Consentimiento en el JWT.** `telemetryConsent` viaja en el token: sin él sólo
   entran los eventos `sistema`. Se prende y se apaga desde el perfil.
3. **k-anonimato al publicar.** `K_ANON_MIN = 15`: una celda (barrio × franja) con
   menos de 15 sujetos no se publica. No es un trámite, es la diferencia entre un
   dato y una anécdota con nombre.
4. **Retención acotada.** Eventos crudos 180 días, sesiones 365, agregados
   indefinidos. Un `DELETE /api/v1/me/telemetry` borra los eventos del sujeto y
   recalcula los agregados de esos días.

Chat y voz se miden en volumen (mensajes, minutos, cantidad de pares), nunca en
contenido. No hay grabación de audio en ningún punto del sistema.

## Cómo se lee un corte

Todo reporte sale con su `n` y su margen de error. La muestra es la que es: juega
quien juega. Un corte de intención de voto de Esquel 2027 dice qué piensan **los
jugadores de un videojuego de Esquel**, no el padrón. Con eso alcanza para detectar
tendencias por barrio, que es justamente para lo que sirve.

| Rol | Ve |
|---|---|
| `player` | lo suyo |
| `sponsor` | las métricas de su comercio |
| `analyst` | los agregados publicables |
| `admin` | lo anterior, más la traza de auditoría |
