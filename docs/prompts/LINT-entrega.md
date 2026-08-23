# El linter: de un script que nunca corrió a cero hallazgos

> **Estado:** cerrado · `npm run lint` en verde y en el CI
> 89 hallazgos encontrados, 89 resueltos · rama `claude/esquel-2027-architecture-6aegk3`

## Lo que estaba roto

El `package.json` tenía `"lint": "eslint . --ext .ts,.tsx"` desde la Fase 0.
Nunca funcionó, por tres motivos a la vez:

| # | Problema | Consecuencia |
|---|---|---|
| 1 | ESLint no era dependencia del proyecto | Corría por un ESLint **global del entorno**. En un clon limpio o en el CI: «command not found» |
| 2 | No existía ningún `eslint.config.js` | Aun con el binario, no arrancaba |
| 3 | El flag `--ext` se eliminó en ESLint 9 | La línea del script también estaba vencida |

El primero es el que importa: **el proyecto no era reproducible**. Funcionaba en
una máquina por un accidente de instalación global, versión 10.1.0, distinta de
cualquier otra máquina.

> Nota sobre el diagnóstico. En la auditoría anterior esto figuraba como «hay un
> `.eslintrc` viejo que ESLint 10 ya no lee». Era una causa plausible y estaba
> mal: no había ningún `.eslintrc`. Nunca hubo configuración.

## La configuración

`eslint.config.js`, formato plano de ESLint 9, con tres decisiones:

**Con información de tipos.** `recommendedTypeChecked` en vez de la variante
liviana. Es más lento, y es el que encuentra bugs de verdad en lugar de
problemas de estilo: promesas sin esperar, `any` que se filtra, valores que se
convierten mal a texto. En un servidor de juego lleno de `async`, eso no es un
lujo.

**Un bloque por paquete.** No es lo mismo `client/` —navegador, React— que
`server-vps/` —Node—. Cada uno declara los globales que realmente tiene, así una
variable inexistente se detecta en vez de colarse por global del otro entorno.
`/shared` va más apretado todavía: prohíbe `window`, `document` y `process`,
porque lo importan los tres paquetes y no puede depender de ninguno.

**Los desactivados llevan el motivo escrito.** Hay exactamente uno a nivel de
proyecto, y está explicado abajo.

## Los 89 hallazgos

| Regla | Cantidad | Qué era |
|---|---|---|
| `no-unnecessary-type-assertion` | 62 | Casts `as X` redundantes. Auto-corregidos |
| `unbound-method` | 5 | Selectores de zustand. **Causa de raíz corregida** |
| `no-base-to-string` | 5 | Valores que se volvían `[object Object]` |
| `no-unsafe-*` | 8 | `any` de librerías de terceros filtrándose |
| `no-empty` | 3 | `catch {}` que se tragaban errores en silencio |
| `require-await` | 2 | `async` sin `await`. **Regla apagada, con motivo** |
| `react-hooks/exhaustive-deps` | 2 | Dependencias de efectos |
| `no-misused-promises` | 1 | **Un bug real de producción** |
| `react-refresh/only-export-components` | 1 | Un reexport muerto |

### Los tres que eran bugs de verdad

**1. El endpoint `/metrics` no podía fallar bien.** El handler era `async` sin
`try`, y Express 4 no espera la promesa. Si el matchmaker fallaba, el rechazo
quedaba sin atender y la petición **se colgaba** en vez de devolver un error.
Justo el endpoint que mira el monitoreo cuando algo anda mal era el que no sabía
avisar que andaba mal. Ahora atrapa y responde 503.

**2. El CSV del dashboard corrompía celdas en silencio.** `csvField()` hacía
`String(value)`: cualquier valor que no fuera primitivo salía `[object Object]`
en la celda, y el que abría el archivo se llevaba un dato destruido sin ningún
aviso. Ahora los objetos van como JSON, y si ni eso se puede —referencia
circular— dice qué pasó en vez de escribir basura.

**3. Todo lo que la prueba de humo afirmaba sobre el estado replicado pasaba sin
verificar.** Esto salió del hallazgo G de la auditoría y está contado allá.

### Las causas de raíz, en vez de silenciar

**Los 5 `unbound-method`** eran `useGameStore((s) => s.setRankUp)`, que es cómo
se consume una acción de zustand. La interfaz del store declaraba las 21 acciones
como **métodos** (`setRankUp(v): void`), y todas se implementan como flechas que
nunca tocan `this`. El tipo decía algo más fuerte que la realidad. Se pasaron a
**propiedades con tipo función** (`setRankUp: (v) => void`), que es lo que son.
Los cinco hallazgos desaparecieron porque desapareció la causa.

**Los 5 `no-base-to-string`** venían de leer el estado replicado como
`Record<string, unknown>` y coercionar cada campo con `String()` a ciegas. Se
declaró la forma real de lo que viaja por el cable (`PlayerReplicado`,
`MundoReplicado`) y se tipó la sala de Colyseus con genéricos. Las coerciones
defensivas se volvieron innecesarias y se fueron. Ahora un cambio de esquema
aparece como error de compilación y no como un `undefined` en pantalla.

**Los 3 `catch {}`** eran esperas a que levante el servidor en las pruebas de
navegador. Legítimos, pero mudos. Ahora dicen qué están tragando.

### Lo que se apagó, y por qué

Una sola regla en todo el proyecto: **`require-await`**.

Marca todo método `async` que no espera nada adentro. Los dos casos del proyecto
son implementaciones de contratos ajenos —`onAuth` de Colyseus, un mock de una
interfaz asíncrona— donde el `async` no es opcional: lo exige la firma que se
está implementando. No detecta bugs, detecta esa forma. Las reglas que sí
detectan errores de asincronía, `no-floating-promises` y `no-misused-promises`,
quedan encendidas — y la segunda fue la que encontró el bug de `/metrics`.

Además hay **dos silenciados de una línea**, cada uno con su párrafo de
explicación arriba:

- `CampaignModal.tsx`: la dependencia `snapshot` de un `useMemo` parece
  innecesaria y es lo único que hace avanzar el modal. `campana` es una instancia
  mutable cuya referencia no cambia nunca; `snapshot` es el que dispara el
  recálculo. Sacarlo dejaría el modal clavado en el primer dilema.
- `CityScene.tsx`: un `useMemo(…, [])` deliberado, que ya venía de antes.

## Verificación

```
npm run lint          → 0 errores, 0 advertencias
npm run typecheck     → 0 errores, ahora también sobre server-vps/scripts
npm run check:balance · check:wiring · validate:schemas · test:jwt ·
test:intelligence · test:intel · test:debate · test:smoke 17/17
cuatro pruebas de navegador: duelo 12/12 · ascenso 5/5 · dashboard 9/9 · HUD F3
build:client · build:server
```

Que el linter quede en verde no sirve de nada si el arreglo rompió el juego, así
que **la suite entera se volvió a correr después de cada tanda de correcciones**,
incluidas las cuatro pruebas de navegador contra el servidor real.

## Lo que queda

`npm run lint` es ahora un paso del CI, entre el typecheck y `check:wiring`. Un
hallazgo nuevo rompe el build, que es la única forma de que un linter no se
vuelva a pudrir: **el problema de fondo nunca fue la configuración, fue que nada
lo obligaba a correr.**
