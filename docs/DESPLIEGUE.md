# Despliegue en el VPS

El tablero compilado es un sitio estático: HTML, JavaScript, el motor WebAssembly
y el dataset en Arrow. No necesita base de datos, ni proceso Node corriendo, ni
credenciales en el servidor.

Hay dos caminos. **Docker** es el recomendado si el VPS ya lo tiene; **estático**
es más liviano si preferís usar el nginx que ya está instalado.

---

## Opción A — Docker

```bash
git clone <url-del-repo> oit
cd oit

# Compila el dataset desde el libro versionado y arma la imagen
docker compose build

# Levanta en el puerto 8080
docker compose up -d
```

Para que el dataset se genere desde el Google Sheet publicado en vez del libro:

```bash
SHEET_ID=1_NKQkMCwztlKijisKoypiUzBaWXHskReVN5SAc_kAvc docker compose build
```

Verificación:

```bash
curl -I http://localhost:8080/
curl    http://localhost:8080/health     # → ok
```

Detrás de un proxy inverso conviene no exponer el puerto al mundo. En
`docker-compose.yml`:

```yaml
ports:
  - "127.0.0.1:8080:8080"
```

---

## Opción B — nginx del host

En una máquina con Node 20+ y Python 3.11+:

```bash
git clone <url-del-repo> oit
cd oit
make instalar
make datos          # o `make sheets` para tomarlo del Google Sheet
make comprimir      # compila y deja los .gz al lado de cada archivo

sudo mkdir -p /var/www/turismo
sudo rsync -a --delete web/dist/ /var/www/turismo/
```

Copiá `deploy/nginx.conf` a `/etc/nginx/sites-available/turismo`, ajustá
`root` y `server_name`, y activalo:

```bash
sudo ln -s /etc/nginx/sites-available/turismo /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Si compilás en otra máquina, alcanza con copiar `web/dist/`: no hace falta
Node ni Python en el VPS.

---

## Dos ajustes que no son opcionales

Si el tablero se queda en la pantalla de carga, casi siempre es uno de estos dos.

**1. El `.wasm` tiene que salir como `application/wasm`.**
Si el servidor lo entrega como `application/octet-stream`, el navegador rechaza
la compilación en streaming y el motor no arranca. La config incluida ya lo
define. Para verificar:

```bash
curl -sI https://tu-dominio/assets/duckdb-eh-*.wasm | grep -i content-type
# → content-type: application/wasm
```

**2. La compresión tiene que estar activa.**
El motor de DuckDB pesa 33 MB sin comprimir y 7 MB con gzip. Sin compresión el
tablero igual funciona, pero la primera carga es cuatro veces más lenta.

```bash
curl -sI -H 'Accept-Encoding: gzip' https://tu-dominio/assets/duckdb-eh-*.wasm | grep -i content-encoding
# → content-encoding: gzip
```

El costo es solo de la primera visita: los assets llevan hash en el nombre y se
cachean por un año. El dataset completo son ~154 KB comprimidos.

---

## HTTPS

Con Caddy (el camino más corto — certificado automático):

```caddy
turismo.tudominio.gob.ar {
    encode gzip
    reverse_proxy 127.0.0.1:8080      # con Docker
    # root * /var/www/turismo         # o servido directo
    # file_server
}
```

Con nginx + certbot:

```bash
sudo certbot --nginx -d turismo.tudominio.gob.ar
```

---

## Servir desde un subdirectorio

El build usa rutas relativas (`base: './'` en `vite.config.ts`), así que
`https://dominio/turismo/` funciona sin recompilar. Solo hay que mantener la
carpeta `data/` **junto al `index.html`**, no en la raíz del dominio.

---

## Actualización automática

El ETL es idempotente y aborta si el resultado se aleja de la serie oficial, así
que puede correr sin supervisión.

### Con nginx del host

```bash
sudo crontab -e
```

```cron
# Actualiza el tablero todos los días a las 06:15
15 6 * * * cd /opt/oit && /usr/bin/make actualizar DESTINO=/var/www/turismo >> /var/log/oit.log 2>&1
```

Para publicar en otro servidor, `DESTINO` acepta destino rsync:
`usuario@vps:/var/www/turismo`.

### Con Docker

```cron
30 6 * * * cd /opt/oit && SHEET_ID=<id> docker compose build && docker compose up -d >> /var/log/oit.log 2>&1
```

### Qué mirar en el log

Cada corrida imprime el informe del ETL: período procesado, cobertura por
categoría, estados sin clasificar y la reconciliación contra la planilla. Si la
divergencia supera el umbral, termina con código 1 y **no publica**. Ese es el
caso a revisar: casi siempre significa que cambió la estructura de la planilla.

---

## Requisitos

**Servidor:** cualquier VPS que sirva archivos estáticos. 1 vCPU y 1 GB de RAM
sobran. El sitio compilado ocupa ~75 MB en disco (el grueso son las dos variantes
del motor WebAssembly; el navegador descarga solo una).

**Navegador:** cualquiera con WebAssembly — Chrome/Edge 90+, Firefox 89+,
Safari 15+. El procesamiento ocurre en la máquina del usuario, así que en
equipos muy viejos la primera carga puede tardar unos segundos más.

---

## Diagnóstico rápido

| Síntoma | Causa habitual |
|---|---|
| Se queda en «Iniciando motor analítico» | El `.wasm` no sale como `application/wasm` |
| «No se pudo descargar *.arrow» | Falta la carpeta `data/` junto al `index.html`; correr `make datos` |
| Primera carga muy lenta | Compresión desactivada en el servidor |
| Secciones vacías tras filtrar | No es un error: el recorte no tiene días publicables. Se ve en **Calidad del dato** |
| El ETL termina con código 1 | La reconciliación superó el umbral. Leer el informe: indica en qué categorías y meses |
