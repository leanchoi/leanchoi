# Pruebas de navegador

Lo que no se puede verificar sin un navegador de verdad: que la mesa de cartas se
abra en las dos pantallas, que el rastreador de misiones muestre lo que manda el
servidor y que la campaña del Modo Candidato llegue a un final y se liquide.

No corren en el CI porque necesitan Chromium y un bundle servido. Se corren a
mano cuando se toca la UI de juego.

## Cómo se corren

```bash
# 1. Los dos bundles, porque las pruebas usan los artefactos reales.
npm run build:client
npm run build:server

# 2. El bundle servido en :4173.
npm run preview --workspace client &

# 3. Playwright (no es dependencia del repo: se instala aparte).
npm i --no-save playwright

# 4. Las pruebas. El argumento es el directorio donde dejan las capturas.
node tools/browser-tests/duelo-chicanas.mjs /tmp/capturas
node tools/browser-tests/hud-fase3.mjs /tmp/capturas
node tools/browser-tests/dashboard.mjs /tmp/capturas
```

Cada una levanta su propio servidor de juego en un puerto libre y mintea los
tokens con el `Jwt.php` de Hostinger, así que verifican la cadena entera:
PHP firma → Node valida → Colyseus simula → el navegador dibuja.

## Qué verifica cada una

| Prueba | Qué prueba |
|---|---|
| `duelo-chicanas.mjs` | Beto encara a Marta con `G`, ella acepta desde el cartel, se abre la mesa en las dos pantallas, cada uno juega una carta y el daño y el registro coinciden en ambas |
| `hud-fase3.mjs` | Las misiones anunciadas llegan al rastreador, «Anotarme» queda registrado en el servidor, las cinco zonas se replican, y la campaña del Modo Candidato se juega entera y se cobra |
| `dashboard.mjs` | El Dashboard de Campaña con datos sintéticos: los trece barrios dibujados, los que no llegan al umbral rayados, las once bancas repartidas, la tendencia respondiendo al mouse y la consola Live-Ops montada |

`dashboard.mjs` es el único que **no** levanta un servidor de juego: intercepta
las tres llamadas de red y devuelve un `DashboardSnapshot` armado a mano. Lo que
verifica es el render, no el backend — el backend PHP necesita MySQL y eso se
prueba en el job `base-de-datos` del CI.

## Notas del entorno

- El Chromium preinstalado está en `/opt/pw-browsers/`. Las pruebas apuntan ahí
  con `executablePath`; si tu instalación difiere, cambiá esa línea.
- **No** hay que pasarle la opción `proxy` a Playwright: rompe el acceso a
  `localhost`.
- Si la API de clima está bloqueada, el cliente cae a la climatología y las
  pruebas filtran ese error de consola a propósito.
