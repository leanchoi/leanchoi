# Esquel 2027 — Guía de despliegue

> Dos servidores, dos responsabilidades. **Hostinger** sirve la aplicación, la
> identidad y los datos; el **VPS** corre el mundo en tiempo real. No se mezclan:
> el VPS nunca toca MySQL y Hostinger nunca abre un WebSocket.

```
        navegador
       ┌────────────────────────────────────────────┐
       │ https://esquel2027.ar        wss://rt.…    │
       ▼                                            ▼
┌──────────────────┐   HMAC firmado      ┌────────────────────┐
│    HOSTINGER     │◄────────────────────│   VPS (Node.js)    │
│  Apache + PHP 8  │  stats, telemetría  │ Colyseus + WebRTC  │
│  MySQL 8         │                     │ PM2, 1 proc/shard  │
│  SPA + /admin    │  JWT HS256 ─────────►│ (verifica, no crea)│
└──────────────────┘                     └────────────────────┘
```

**Lo único que comparten son dos secretos**: `JWT_SECRET` (para que el VPS pueda
verificar los tokens que emite Hostinger) y `HOSTINGER_API_KEY` (para que
Hostinger pueda verificar que los volcados vienen del VPS). Si esos dos no
coinciden exactamente en los dos lados, no anda nada y el síntoma es siempre el
mismo: el juego carga y no conecta.

---

## Parte 1 — Hostinger (lo hace el usuario, desde el panel)

### 1.1 Crear la base de datos

1. hPanel → **Bases de datos → Administración de bases MySQL**.
2. *Crear una nueva base de datos*: nombre `esquel2027`, un usuario y una
   contraseña larga. Hostinger les pone el prefijo de la cuenta, así que van a
   quedar con la forma `u123456789_esquel2027` y `u123456789_esquel`.
3. **Anotar los cuatro datos**: host (casi siempre `localhost`), nombre, usuario
   y contraseña. Van al paso 1.4.

### 1.2 Importar el esquema

1. hPanel → **Bases de datos → phpMyAdmin** → entrar a la base recién creada.
2. Pestaña **Importar** → elegir `database/schema.sql` del zip → *Continuar*.
   Son 33 tablas y 4 vistas; tarda unos segundos.
3. Repetir la importación con **cada seed, en orden**:

   ```
   database/seeds/001_facciones.sql
   database/seeds/002_rangos.sql
   database/seeds/003_items.sql
   database/seeds/004_cartas_debate.sql
   database/seeds/005_misiones_catalogo.sql
   database/seeds/006_zonas_territorio.sql
   database/seeds/007_comercios_demo.sql
   ```

   El orden importa: los rangos y las facciones son claves foráneas del resto.

4. Verificar que quedó bien:

   ```sql
   SELECT 'rangos' t, COUNT(*) n FROM rangos
   UNION ALL SELECT 'facciones', COUNT(*) FROM facciones
   UNION ALL SELECT 'cartas',    COUNT(*) FROM cartas_debate
   UNION ALL SELECT 'misiones',  COUNT(*) FROM misiones_catalogo
   UNION ALL SELECT 'zonas',     COUNT(*) FROM zonas_territorio;
   ```

   Tiene que dar **10 rangos, 5 facciones, 24 cartas, 10 misiones y 5 zonas**.

> **Base que ya existe de una versión anterior:** no hay que reimportar el
> esquema. Se aplican las migraciones que falten, en orden, desde
> `database/migrations/`: `0002_registro_rapido.sql`, `0003_gameplay_fase3.sql`,
> `0004_inteligencia_fase4.sql`. Cada una tiene su `.down.sql` al lado por si hay
> que volver atrás.

### 1.3 Subir la aplicación

1. En la máquina de desarrollo, generar el paquete:

   ```bash
   ./tools/deploy/package-hostinger.sh          # Linux y macOS
   .\tools\deploy\package-hostinger.ps1         # Windows
   ```

   Deja `hostinger-deploy.zip` en la raíz del repo (≈1,5 MB).

2. hPanel → **Archivos → Administrador de archivos** → entrar a `public_html`.
3. **Vaciar `public_html`** si tiene la página por defecto de Hostinger.
4. Subir `hostinger-deploy.zip` y **Extraer** ahí mismo.
5. Confirmar que en la raíz de `public_html` quedaron: `index.html`, `.htaccess`,
   `assets/`, `prefabs/`, `api/`, `src/`, `config/` y `database/`.

> Si el Administrador de archivos no muestra el `.htaccess`, activar *Mostrar
> archivos ocultos* en el menú de la esquina. Sin `.htaccess` la SPA carga la
> home pero `/admin` da 404 al recargar.

### 1.4 Configurar las credenciales

1. En `public_html/config/`, copiar `config.example.php` a **`local.php`**.
2. Editar `local.php` y completar:

   ```php
   'db' => [
       'dsn'      => 'mysql:host=localhost;dbname=u123456789_esquel2027;charset=utf8mb4',
       'user'     => 'u123456789_esquel',
       'password' => 'la-contraseña-del-paso-1.1',
   ],
   'jwt' => [
       'secret' => 'CADENA-LARGA-Y-ALEATORIA',   // la misma que el VPS
       'issuer' => 'https://esquel2027.ar',
   ],
   'realtime' => [
       'endpoint'             => 'wss://rt.esquel2027.ar',
       'internal_hmac_secret' => 'OTRA-CADENA-LARGA',  // la misma que el VPS
       'allowed_ips'          => ['203.0.113.10'],     // la IP del VPS
   ],
   'telemetry' => [
       'pseudonym_salt' => 'UNA-TERCERA-CADENA',  // rota cada 30 días
   ],
   'security' => [
       'ip_hash_salt' => 'UNA-CUARTA-CADENA',
   ],
   'admin' => [
       // Hash de la clave maestra del dashboard. Se genera con:
       //   php -r "echo password_hash('la-clave', PASSWORD_ARGON2ID);"
       'master_password_hash' => '$argon2id$v=19$...',
   ],
   ```

   Los secretos se generan con `openssl rand -base64 48` (o desde cualquier
   generador de contraseñas). **No** los inventés a mano.

3. Permisos: `local.php` en **600** si el panel deja elegirlos. El `.htaccess` ya
   bloquea el acceso HTTP a ese archivo, pero dos candados son mejor que uno.

### 1.5 Certificado y dominio

1. hPanel → **Seguridad → SSL** → instalar el certificado gratuito en el dominio.
2. Esperar a que quede activo y probar `https://esquel2027.ar`. El `.htaccess`
   fuerza HTTPS: sin certificado, el sitio queda en un bucle de redirección.
3. Para el tiempo real, crear el subdominio **`rt.esquel2027.ar`** apuntando por
   registro `A` a la IP del VPS. Ese subdominio **no** vive en Hostinger: es el
   VPS. Su certificado se emite en la Parte 2.

---

## Parte 2 — VPS (lo hace Antigravity, por SSH)

Probado sobre Ubuntu 22.04 LTS con 2 vCPU y 2 GB. Con eso alcanza para los 120
jugadores de un shard.

### 2.1 Preparar la máquina

```bash
ssh root@<IP-DEL-VPS>

# Usuario sin privilegios para el juego: nada corre como root.
adduser --disabled-password --gecos "" esquel
usermod -aG sudo esquel

# Node 22 (el proyecto usa type-stripping nativo en las herramientas).
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs git nginx certbot python3-certbot-nginx
npm install -g pm2

# Firewall: sólo SSH y HTTPS. El 2567 queda detrás de nginx, nunca expuesto.
ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw --force enable
```

### 2.2 Traer el código y compilar

```bash
su - esquel
git clone https://github.com/leanchoi/leanchoi.git esquel2027
cd esquel2027
npm ci
npm run build --workspace server-vps      # deja dist/index.js
```

### 2.3 Variables de entorno

```bash
cd ~/esquel2027/server-vps
cp .env.example .env
nano .env
```

```ini
NODE_ENV=production
PORT=2567
SHARD_NAME=Esquel - Centro 01

# Los dos secretos compartidos con Hostinger. Tienen que ser IDÉNTICOS.
JWT_SECRET=CADENA-LARGA-Y-ALEATORIA
JWT_ISSUER=https://esquel2027.ar
HOSTINGER_API_KEY=OTRA-CADENA-LARGA
HOSTINGER_API_URL=https://esquel2027.ar/api

# Desde dónde se permite abrir el WebSocket. Los subdominios entran solos.
CORS_ORIGIN=https://esquel2027.ar

AOI_CELLS=4
TICK_HZ=20
VOICE_RANGE_M=25
```

> El nombre del shard evita el guión largo (`—`) a propósito: viaja en una
> cabecera HTTP y las cabeceras son Latin-1. El servidor lo sanea igual, pero
> mejor no darle trabajo.

### 2.4 Arrancar con PM2

```bash
cd ~/esquel2027/server-vps
mkdir -p logs
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup systemd -u esquel --hp /home/esquel   # imprime un comando: correrlo con sudo

# Rotación de logs: PM2 no rota nada de fábrica.
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 20M
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true
```

Comprobar que levantó:

```bash
pm2 status
curl -s localhost:2567/health | head -c 200
# {"ok":true,"shard":"Esquel - Centro 01","env":"production",…}
```

### 2.5 nginx y el certificado del subdominio

```nginx
# /etc/nginx/sites-available/esquel-rt
server {
  server_name rt.esquel2027.ar;

  location / {
    proxy_pass http://127.0.0.1:2567;
    proxy_http_version 1.1;

    # Sin estas tres líneas el WebSocket no sube de HTTP a WS y el juego
    # queda "conectando" para siempre. Es el error más común del despliegue.
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;

    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Una partida larga no puede cortarse por inactividad del proxy.
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
  }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/esquel-rt /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d rt.esquel2027.ar     # emite el certificado y reescribe el server
```

### 2.6 Releases posteriores

Con `pm2 deploy` configurado en `ecosystem.config.cjs`:

```bash
pm2 deploy production setup      # una sola vez
pm2 deploy production            # en cada release
```

O a mano:

```bash
cd ~/esquel2027 && git pull
npm ci && npm run build --workspace server-vps
pm2 reload esquel-realtime       # recarga sin cortar a los que están jugando
```

---

## Parte 3 — Verificación de punta a punta

En orden. Si algo falla, el paso anterior dice dónde mirar.

| # | Qué se prueba | Cómo | Qué tiene que pasar |
|---|---|---|---|
| 1 | La SPA carga | Abrir `https://esquel2027.ar` | Se ve la Plaza San Martín y el HUD |
| 2 | El enrutamiento SPA | Abrir `https://esquel2027.ar/admin` y **recargar** | Aparece la puerta del dashboard, no un 404 |
| 3 | PHP y MySQL | Registrarse con el onboarding de 30 s | Entra al juego con nombre y facción |
| 4 | El JWT llega al VPS | Mirar el HUD arriba a la derecha | Dice **En línea**, no *Conectando* |
| 5 | El WebSocket | `pm2 logs esquel-realtime` | `[sala] entró <alias>` |
| 6 | El volcado de stats | Pegar un afiche (tecla E) y esperar 30 s | En los logs, `[hostinger] lote … → 1 personajes` |
| 7 | La telemetría | `SELECT COUNT(*) FROM telemetria_inteligencia;` | Crece solo mientras alguien juega |
| 8 | El dashboard | Entrar a `/admin` con la clave maestra | Mapa de calor y proyección con datos |
| 9 | Live-Ops | Tirar una noticia bomba desde la consola | Aparece en el chat del juego |
| 10 | Voz por proximidad | Dos pestañas a menos de 25 m, prender el micrófono | Se escuchan, con paneo según la posición |

---

## Cuando algo no anda

| Síntoma | Causa casi siempre | Qué mirar |
|---|---|---|
| `/admin` da 404 al recargar | Falta el `.htaccess` o `mod_rewrite` está apagado | Que el archivo esté en `public_html` y que se vean los ocultos |
| El HUD queda en *Conectando* | El origen no está en `CORS_ORIGIN`, o falta el `Upgrade` en nginx | `pm2 logs` muestra el origen rechazado |
| *Token inválido* al entrar | `JWT_SECRET` distinto en los dos lados | Compararlos carácter por carácter, sin espacios al final |
| `FIRMA_INVALIDA` en los volcados | `HOSTINGER_API_KEY` distinto | Ídem. Y revisar `allowed_ips` |
| El dashboard abre pero está vacío | Todavía no hay muestra suficiente | El panel dice cuántos vecinos faltan por barrio: es correcto, no es un error |
| `CONFIG_INCOMPLETA` | Falta `config/local.php` o le falta una clave | Copiar de `config.example.php` |
| No se conecta a MySQL | El prefijo de la cuenta en el nombre o el usuario | El DSN lleva `u123456789_esquel2027`, no `esquel2027` |
| El sitio redirige en bucle | HTTPS forzado sin certificado instalado | Terminar el paso 1.5 |

---

## Después de desplegar

1. **Rotar la sal de los seudónimos cada 30 días.** Cambiar
   `telemetry.pseudonym_salt` en `local.php`. Los seudónimos viejos dejan de
   poder empalmarse con los nuevos, que es exactamente el punto: la telemetría
   sirve para contar segmentos, no para seguir personas.
2. **Backup de MySQL antes de cada migración.** Desde hPanel →
   *Bases de datos → Copias de seguridad*, o `mysqldump` si hay acceso SSH.
3. **Mirar `pm2 monit`** el primer día con gente de verdad: si la memoria se
   arrima a los 600 MB, el proceso se reinicia solo y los jugadores se reconectan,
   pero conviene saber por qué.
4. **Los comercios auspiciados que vienen en el seed son arquetipos**, no
   comercios identificados. Cargar uno real requiere contrato firmado y
   consentimiento expreso de uso de nombre, marca y fachada.
