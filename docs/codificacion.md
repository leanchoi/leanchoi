# Codificación: agrupar en temas lo que el barrio dijo hablando

Las preguntas abiertas se contestan con la voz. El audio se desgraba y después
desaparece (ver `docs/audio-y-transcripcion.md`). Lo que queda es texto, y este
módulo hace lo único que falta para que ese texto sirva en una reunión: **agruparlo
en temas, ponerle nombre a cada tema y guardar una cita textual que lo represente.**

```
transcripciones sin codificar → agrupar por pregunta → VERIFICAR cada cita
                              → guardar tema + cita → auditar
```

## Lo primero: es opcional

Con `FEATURE_CLUSTERING=false` este módulo no corre y **el sistema funciona
completo**: se encuesta, se sincroniza, se deriva, se acusa recibo, se imprime el
informe de barrio y se exporta el CSV. El tablero simplemente no muestra la sección
«De qué habla el barrio». Nada más cambia.

## Lo segundo: la cita es literal o no es

El pipeline compara cada cita contra la transcripción de la que dice salir
(`verificarCita` → `esCitaTextual`). La comparación tolera espacios de más, comillas
y acentos perdidos, y **nada más**. Si la frase no está en la desgrabación, la cita se
descarta y el texto queda igual dentro de su tema, pero sin comillas.

Esto no es una precaución teórica: el informe de barrio se imprime y se cuelga en la
sede vecinal. Una frase que el vecino nunca dijo, colgada en la pared con su barrio
al lado, es un daño que no se arregla con una fe de erratas.

El contador queda a la vista en cada corrida:

```
✔ Citas: 34 verificadas, 2 descartadas por no ser literales.
```

## Qué se manda afuera, si se manda algo

Solo el texto de la desgrabación y un identificador corto y descartable (`f1`, `f2`).
Nunca el ticket, ni la vivienda, ni el barrio, ni nada del esquema `identificada`.
La correspondencia entre `f1` y la transcripción real vive en memoria del proceso y
se pierde cuando termina.

## Proveedores

| Proveedor | `CLUSTERING_PROVIDER` | Red | Claves | Para qué |
|---|---|---|---|---|
| Léxico local | `stub` | no | no | Desarrollo, tests, y producción hasta que haya servicio contratado |
| Anthropic | `anthropic` | sí | `ANTHROPIC_API_KEY` | Agrupamiento fino, etiquetas mejor redactadas |

El **stub** agrupa con el léxico de `src/lib/codificacion/lexico.ts` (calles,
alumbrado, agua, basura, seguridad, salud, transporte, plazas, animales, niñez,
vivienda, deportes) y recorta la cita de la propia transcripción, así que la cita es
literal por construcción. Es determinístico: la misma entrada da siempre la misma
salida. No es tan fino como un modelo, pero es honesto y no depende de nadie.

Ese léxico **está hecho para editarse a mano**. Si en Esquel aparece un tema que no
está, se agrega ahí y el stub lo reconoce en la próxima corrida.

### Enchufar otro proveedor

Tres pasos, y nada más del sistema se entera:

1. implementar `ClusteringProvider` (`src/lib/codificacion/tipos.ts`) en
   `src/lib/codificacion/proveedores/`;
2. sumar el nombre al enum `CLUSTERING_PROVIDER` en `src/lib/env.ts`;
3. agregar el `case` en `src/lib/codificacion/registro.ts`.

La interfaz es corta a propósito:

```ts
interface ClusteringProvider {
  readonly nombre: string;
  readonly requiereRed: boolean;
  verificarConfiguracion(): VerificacionProveedor;
  agrupar(entrada: EntradaClustering, señal?: AbortSignal): Promise<ResultadoClustering>;
}
```

`verificarConfiguracion()` se llama **antes** de gastar una llamada real: devuelve la
lista de lo que falta. El worker la usa para fallar temprano y con un mensaje que se
entiende.

## Configuración

| Variable | Por defecto | Qué hace |
|---|---|---|
| `FEATURE_CLUSTERING` | `false` | Prende el módulo. Apagado, no corre nada. |
| `CLUSTERING_PROVIDER` | `stub` | `stub` o `anthropic`. |
| `ANTHROPIC_API_KEY` | — | Solo si `CLUSTERING_PROVIDER=anthropic`. |
| `ANTHROPIC_MODEL` | `claude-opus-5` | Modelo a usar. |
| `CLUSTERING_TIMEOUT_MS` | `600000` | Tope por pedido. |
| `CLUSTERING_MAX_TEMAS` | `10` | Tope de temas por pregunta: más no entra en una carilla A4. |
| `CLUSTERING_LOTE` | `120` | Transcripciones por corrida. |
| `CLUSTERING_MINIMO_FRAGMENTOS` | `5` | Debajo de esto no se agrupa; los textos esperan a la corrida siguiente. |

## Cómo se corre

```bash
npm run codificar
```

Pensado para cron, unas pocas veces por día y después del worker de audio
(`npm run audio:procesar`). Es idempotente por construcción: solo toma
transcripciones que todavía no tienen codificación, así que correrlo dos veces no
duplica nada.

Cada corrida escribe en `audit_log` una fila `codificacion.pregunta` con el
proveedor, el modelo, cuántos textos entraron, cuántos temas salieron y cuántas citas
se verificaron y se descartaron.

## Dónde se ve

En `/panel/tablero`, sección **«De qué habla el barrio»**: los temas ordenados por
cantidad, con su porcentaje y hasta tres citas textuales del barrio elegido. Se aplica
el mismo piso de agregación que al resto del tablero (`MINIMO_PARA_AGREGAR`): con
menos casos no se muestra nada, para que un tema no termine señalando a una sola casa.

## Lo que NO está hecho

- No hay reprocesamiento desde la interfaz. Para volver a agrupar hay que borrar las
  filas de `analitica.codificaciones` de esas transcripciones
  (`RepositorioCodificacionDrizzle.rehacer`) y correr el worker de nuevo.
- Las citas no pasan por revisión humana antes de salir en el informe. Si el equipo
  quiere ese paso, el lugar es entre `codificarPendientes` y el tablero.
- El léxico del stub está escrito con lo que se sabe hoy del operativo; hay que
  revisarlo contra las primeras desgrabaciones reales.
