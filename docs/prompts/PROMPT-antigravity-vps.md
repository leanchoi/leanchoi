# Prompt para Antigravity — poner el VPS en vivo

Copiá todo lo que está debajo de la línea y pegáselo a Antigravity.
Reemplazá antes los cinco valores entre `<>` de la primera sección.

---

Sos un ingeniero de infraestructura con acceso SSH y `sudo` a un VPS Linux
limpio. Tu tarea es poner en producción el servidor autoritativo de tiempo real
de un juego multijugador, dejarlo verificado y sobreviviendo a un reinicio.

Trabajá paso a paso. **Después de cada bloque, verificá antes de seguir.** Si una
verificación falla, resolvela ahí mismo: no avances con algo roto atrás.

## Datos del entorno

```
DOMINIO_JUEGO   = <esquel2027.ar>            # donde está el PHP y la web
SUBDOMINIO_RT   = <rt.esquel2027.ar>         # este VPS; el DNS ya apunta acá
REPO            = <git@github.com:leanchoi/leanchoi.git>
RAMA            = <claude/esquel-2027-architecture-6aegk3>
USUARIO_APP     = <esquel>                   # usuario sin privilegios a crear
```

**Dos secretos los tiene que dar el humano, no los generes vos.** Ya existen en
Hostinger, en `public_html/config/local.php`, y tienen que coincidir **carácter
por carácter**:

| Variable del VPS | Clave en `local.php` de Hostinger |
|---|---|
| `JWT_SECRET` | `jwt.secret` |
| `HOSTINGER_API_KEY` | `realtime.internal_hmac_secret` |

Si no los tenés, **pedilos y frená**. Un secreto distinto no da error al
arrancar: el servidor levanta bien y después rechaza todos los tokens con
«firma inválida», que es un síntoma que parece cualquier otra cosa. Es el fallo
número uno de este despliegue.

## Qué es esto

Un servidor Colyseus (WebSocket) sobre Node. Mantiene el estado del mundo **en
la memoria del proceso**: hasta 120 jugadores por shard, simulación a 20 Hz,
canal de interés a 10 Hz, y señalización WebRTC para voz por proximidad (el
audio va P2P, nunca pasa por el servidor).

Cada 30 segundos vuelca XP, guita y reputación al backend PHP de
`DOMINIO_JUEGO`, firmado con HMAC.

El repo es un monorepo con cuatro paquetes. **Sólo `server-vps` corre acá**;
`client` y `backend-php` van a Hostinger y no son asunto tuyo.

## Paso 1 — Base del sistema

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git ufw nginx

# Node 22 o superior. El package.json declara engines >=22 y el servidor usa
# `--env-file-if-exists`, que es nativo desde Node 20.12.
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2

# Usuario sin privilegios: el juego no corre como root.
sudo adduser --disabled-password --gecos "" USUARIO_APP
```

**Verificá:** `node -v` da v22 o más; `pm2 -v` responde.

## Paso 2 — Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
```

**El puerto 2567 NO se abre al mundo.** El juego escucha sólo en local y nginx
hace de frente. Si lo exponés, cualquiera se saltea el TLS y el rate limiting.

**Verificá:** `sudo ufw status` muestra 22, 80 y 443, y **no** 2567.

## Paso 3 — Código y compilación

Como `USUARIO_APP`:

```bash
cd ~
git clone REPO esquel2027
cd esquel2027
git checkout RAMA
npm ci                                    # desde la RAÍZ: es un monorepo
npm run build --workspace server-vps      # esbuild → server-vps/dist/index.js
mkdir -p server-vps/logs
```

**Verificá:** existe `server-vps/dist/index.js` y pesa unos 80 KB.

## Paso 4 — Variables de entorno

Creá `server-vps/.env` (nunca se versiona, nunca se commitea):

```ini
NODE_ENV=production
PORT=2567
LOG_LEVEL=info

SHARD_NAME=Esquel - Centro 01
SHARD_CAPACITY=120

JWT_SECRET=<el que te dio el humano, el mismo de Hostinger>
JWT_ISSUER=https://DOMINIO_JUEGO
JWT_AUDIENCE=esquel-realtime
JWT_CLOCK_TOLERANCE_S=60

HOSTINGER_API_URL=https://DOMINIO_JUEGO/api
HOSTINGER_API_KEY=<el que te dio el humano, el mismo de Hostinger>
HOSTINGER_FLUSH_MS=30000
HOSTINGER_TIMEOUT_MS=8000

CORS_ORIGIN=https://DOMINIO_JUEGO

AOI_CELLS=4
VOICE_RANGE_M=25
TICK_HZ=20
AOI_HZ=10
```

```bash
chmod 600 server-vps/.env
```

Cuatro cosas que importan:

1. **`SHARD_NAME` sin guión largo (—).** Viaja en una cabecera HTTP y las
   cabeceras son Latin-1. El servidor lo sanea, pero no le des trabajo.
2. **`HOSTINGER_API_URL` termina en `/api`, sin `/v1`.** Los archivos PHP viven
   en `public_html/api/`. Un `/api/v1` da 404 en todo.
3. **`CORS_ORIGIN` es el dominio del juego, no el de este VPS.** Los subdominios
   del dominio declarado entran solos.
4. **El `.env` lo lee Node nativo**, ya configurado en el script `start` y en
   `node_args` de PM2. No instales `dotenv`.

**Verificá que arranca a mano antes de meter PM2:**

```bash
cd server-vps && npm start
```

Tiene que imprimir `escuchando en :2567 (production)`, el nombre del shard y los
orígenes permitidos. Cortá con Ctrl-C.

Si dice `Falta la variable de entorno JWT_SECRET` o `JWT_SECRET tiene que tener
al menos 32 caracteres`, faltó el secreto: el servidor se niega a arrancar a
propósito.

## Paso 5 — PM2

El repo trae `server-vps/ecosystem.config.cjs`. **No lo reescribas.** Va en
`.cjs` porque el workspace es ESM, y usa `fork` y no `cluster` a propósito:
Colyseus guarda el mundo en la memoria del proceso, así que en cluster dos
jugadores que entran a «la misma» sala caerían en mundos distintos sin verse. Se
escala con más procesos en puertos distintos, uno por shard.

```bash
cd ~/esquel2027/server-vps
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup            # ejecutá el comando con sudo que imprime

# PM2 no rota logs de fábrica: un VPS chico se llena en semanas.
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 20M
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true
```

**Verificá:**

```bash
pm2 status                                    # esquel-realtime · online
curl -s http://127.0.0.1:2567/health          # {"ok":true,"shard":"…"}
curl -s http://127.0.0.1:2567/metrics         # salas y jugadores
```

## Paso 6 — nginx como proxy inverso

**Esta es la parte donde más se falla.** Un proxy normal no sirve: WebSocket
necesita las cabeceras de actualización de protocolo, y sin ellas el cliente se
queda en «Conectando…» para siempre sin ningún error visible.

`/etc/nginx/sites-available/esquel-rt`:

```nginx
upstream esquel_shards {
    server 127.0.0.1:2567;
    # Un segundo shard se agrega acá con otro puerto. Colyseus guarda el estado
    # en memoria, así que el balanceo tiene que ser pegajoso por sala; con un
    # solo shard esto no aplica todavía.
    keepalive 32;
}

server {
    listen 80;
    listen [::]:80;
    server_name SUBDOMINIO_RT;
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name SUBDOMINIO_RT;

    # certbot completa los certificados en el paso 7.

    location / {
        proxy_pass http://esquel_shards;
        proxy_http_version 1.1;

        # --- LAS TRES QUE HACEN QUE wss:// FUNCIONE ---
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host       $host;
        # ----------------------------------------------

        proxy_set_header X-Real-IP        $remote_addr;
        proxy_set_header X-Forwarded-For  $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Una partida es una conexión larga: sin esto nginx la corta al minuto.
        proxy_read_timeout  3600s;
        proxy_send_timeout  3600s;
        proxy_buffering     off;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/esquel-rt /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

## Paso 7 — TLS

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d SUBDOMINIO_RT
sudo systemctl status certbot.timer     # la renovación automática
```

El navegador va a pedir `wss://`, y `wss://` **exige** certificado válido: una
página servida por HTTPS no abre un WebSocket sin cifrar.

## Paso 8 — Verificación final

Hacé estas ocho y reportá el resultado de cada una:

1. `pm2 status` → `esquel-realtime` en `online`, con 0 reinicios.
2. `curl -s https://SUBDOMINIO_RT/health` → `{"ok":true,…}` por HTTPS.
3. `curl -s https://SUBDOMINIO_RT/metrics` → responde con salas y jugadores.
4. El WebSocket sube de protocolo:
   ```bash
   curl -i -N -o - --max-time 5 \
     -H "Connection: Upgrade" -H "Upgrade: websocket" \
     -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
     https://SUBDOMINIO_RT/ 2>&1 | head -5
   ```
   Tiene que decir **`101 Switching Protocols`**. Si dice `200` o `400`, faltan
   las cabeceras del paso 6.
5. `sudo ufw status` → 2567 **no** figura.
6. `pm2 logs esquel-realtime --lines 40` → sin errores repetidos. Ojo con
   `[hostinger] falló el lote`: significa que el VPS no llega al PHP, o que el
   `HOSTINGER_API_KEY` no coincide.
7. Reinicio real: `sudo reboot`, esperá, y `pm2 status` tiene que mostrarlo
   `online` solo. Si no vuelve, faltó `pm2 startup`.
8. Certificado: `sudo certbot certificates` → válido, con renovación armada.

## Redespliegues

```bash
cd ~/esquel2027 && git pull && npm ci \
  && npm run build --workspace server-vps \
  && pm2 reload esquel-realtime
```

`reload` y no `restart`: recarga sin cortarle la partida a quien esté jugando.

## Reglas

- **No inventes los dos secretos.** Si no los tenés, pedilos y frená.
- **No abras el 2567** al mundo.
- **No pases PM2 a `cluster`** ni a `instances: max`.
- **No instales `dotenv`** ni toques los scripts del `package.json`.
- **No commitees ni subas el `.env`.**
- Si algo no coincide con lo que dice este prompt —otra versión de Node, otro
  gestor que no sea nginx, el puerto ocupado—, **pará y explicá qué encontraste**
  antes de improvisar una solución.

## Qué reportar al terminar

- El resultado de las ocho verificaciones del paso 8, una por una.
- La salida de `pm2 status` y de `node -v`.
- Cualquier cosa que hayas tenido que cambiar respecto de este prompt, y por qué.
- Confirmación de que `.env` tiene permisos `600` y no está en Git.
