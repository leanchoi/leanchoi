# HANDOFF — despliegue del Relevamiento Barrial de Esquel

**Destinatario: un agente de IA con acceso SSH al VPS.** Este documento está escrito
para ejecutarse, no para leerse en diagonal. Los comandos son literales y copiables.
Donde dice _respuesta esperada_, verificá la salida antes de seguir.

- Repositorio: sistema de relevamiento barrial de la Municipalidad de Esquel (Chubut).
- Versión de esta guía: **0.1.0** (fase 0 — scaffolding).
- Stack desplegado: un contenedor de aplicación (Next.js, salida `standalone`) y uno de
  Postgres 16 con volumen persistente, orquestados por `docker compose`.

---

## 0. ADVERTENCIA — datos personales

Este sistema almacena **datos personales** de vecinos y vecinas de Esquel: nombre,
apellido, últimos dígitos del DNI, domicilio, teléfono, correo y respuestas sobre su
hogar, incluidas preguntas sensibles sobre seguridad y convivencia. Están alcanzados por
la **Ley 25.326 de Protección de Datos Personales**.

- **NO exponer el servicio a internet sin TLS.** Nada de `http://` público. Poné un
  proxy inverso con certificado válido (Caddy, nginx + certbot, Traefik) delante de la
  aplicación y publicá el contenedor solo en `127.0.0.1` (`APP_BIND=127.0.0.1`).
- Con TLS terminado en el proxy, dejar `SESSION_COOKIE_SECURE=true` y `APP_BASE_URL`
  en `https://`.
- **No publiques el puerto de Postgres** al exterior. El compose de producción no lo
  hace: no lo agregues.
- Los dumps de backup contienen datos personales: permisos `600`, fuera de directorios
  servidos por web, y cifrados si salen del servidor.
- Si algo de esto no se puede cumplir, **no completes el deploy**: reportalo y esperá
  instrucciones.

---

## 1. Requisitos del host

| Requisito     | Mínimo                   | Comentario                                      |
| ------------- | ------------------------ | ----------------------------------------------- |
| SO            | Linux x86_64 con systemd | Debian 12 / Ubuntu 22.04+ probados              |
| Docker Engine | 24+                      | con plugin `docker compose` v2                  |
| RAM           | 2 GB                     | 4 GB si se construye la imagen en el mismo host |
| Disco libre   | 10 GB                    | imagen + volumen de Postgres + backups          |
| Red saliente  | sí, durante el build     | para bajar imágenes base y dependencias npm     |
| Puertos       | uno libre para la app    | ver sección 3                                   |
| git           | cualquiera reciente      | para clonar y actualizar                        |

Verificación:

```bash
docker --version && docker compose version
free -m | awk '/Mem:/ {print "RAM total MB:", $2}'
df -h / | tail -1
```

_Respuesta esperada:_ Docker 24 o superior, Compose `v2.x`, RAM ≥ 2000 MB, disco
disponible ≥ 10 G. Si Docker no está instalado, instalalo con el paquete oficial de la
distribución antes de seguir.

---

## 2. Variables de entorno

Todas viven en un único archivo `.env` en la raíz del repo, junto a
`docker-compose.yml`. `.env` **nunca** se commitea. La plantilla completa y comentada es
`.env.example`.

### 2.1 Obligatorias

| Variable            | Qué es                               | Cómo se obtiene                        |
| ------------------- | ------------------------------------ | -------------------------------------- |
| `PORT`              | Puerto de la app (host y contenedor) | Elegir uno libre — sección 3           |
| `POSTGRES_USER`     | Usuario de la base                   | Fijo: `relevamiento`                   |
| `POSTGRES_PASSWORD` | Contraseña de la base                | **GENERAR** (sección 2.2)              |
| `POSTGRES_DB`       | Nombre de la base                    | Fijo: `relevamiento`                   |
| `DATABASE_URL`      | Cadena de conexión de la app         | Se arma con los tres valores de arriba |
| `SESSION_SECRET`    | Firma de las cookies de sesión       | **GENERAR** (sección 2.2)              |
| `APP_BASE_URL`      | URL pública del sistema              | `https://` + el dominio real           |
| `NODE_ENV`          | Entorno                              | `production`                           |
| `TZ`                | Zona horaria                         | `America/Argentina/Buenos_Aires`       |

### 2.2 Secretos a generar

```bash
openssl rand -base64 24   # -> POSTGRES_PASSWORD (sin comillas, sin espacios)
openssl rand -hex 32      # -> SESSION_SECRET (mínimo 32 caracteres)
```

`DATABASE_URL` se arma con la contraseña generada y el host `db` (nombre del servicio de
compose, resuelto dentro de la red interna):

```
DATABASE_URL=postgres://relevamiento:<POSTGRES_PASSWORD>@db:5432/relevamiento
```

Si la contraseña contiene `@`, `:`, `/` o `#`, generá otra sin esos caracteres o
codificala en porcentaje. Cambiar `SESSION_SECRET` cierra todas las sesiones abiertas.

### 2.3 Con valor por defecto razonable

| Variable                                                       | Default     | Cuándo tocarla                                       |
| -------------------------------------------------------------- | ----------- | ---------------------------------------------------- |
| `APP_BIND`                                                     | `0.0.0.0`   | Poner `127.0.0.1` si hay proxy inverso (recomendado) |
| `SESSION_COOKIE_SECURE`                                        | `true`      | Solo `false` en desarrollo sin TLS                   |
| `SESSION_TTL_HORAS`                                            | `12`        | Duración de la sesión del personal                   |
| `MAIL_TRANSPORT`                                               | `console`   | `smtp` cuando haya casilla real del municipio        |
| `MAIL_FROM`, `SMTP_*`                                          | —           | Solo con `MAIL_TRANSPORT=smtp`                       |
| `FEATURE_AUDIO`, `FEATURE_TRANSCRIPCION`, `FEATURE_CLUSTERING` | `false`     | El sistema funciona completo con los tres apagados   |
| `TRANSCRIPTION_PROVIDER`, `CLUSTERING_PROVIDER`                | `stub`      | `anthropic` requiere `ANTHROPIC_API_KEY`             |
| `DATABASE_POOL_MAX`                                            | `10`        | Subir solo con evidencia de saturación               |
| `BACKUP_DIR`                                                   | `./backups` | Ruta absoluta si los backups van a otro volumen      |
| `BACKUP_RETENCION_DIAS`                                        | `30`        | Días que se conservan los dumps locales              |
| `LOG_LEVEL`                                                    | `info`      | `debug` para diagnosticar                            |

---

## 3. Elegir y fijar el puerto

El puerto **no está escrito en ningún archivo de código**: se define una sola vez, en
`PORT` dentro de `.env`, y de ahí lo toman el proceso Next, el publicado de
`docker compose`, el healthcheck del contenedor y los tests.

Buscar un puerto libre:

```bash
ss -ltnp | awk '{print $4}' | sed 's/.*://' | sort -n | uniq   # puertos ocupados
for p in 3000 3100 4000 8080 8137 9000; do
  (ss -ltn | grep -q ":$p " && echo "$p OCUPADO") || echo "$p libre"
done
```

Elegí uno que diga `libre`, escribilo en `.env` y verificá que quedó:

```bash
sed -i 's/^PORT=.*/PORT=8137/' .env     # reemplazar 8137 por el elegido
grep '^PORT=' .env
```

_Respuesta esperada:_ `PORT=8137`.

**Dónde queda escrito el puerto elegido:** únicamente en `/opt/relevamiento-esquel/.env`
(o la ruta donde clonaste el repo). Ese archivo es la fuente de verdad. Si además hay un
proxy inverso, el mismo número se repite en la directiva `proxy_pass` /
`reverse_proxy` de ese proxy — son los dos únicos lugares.

Para cambiar el puerto después: editar `.env`, `docker compose up -d` y ajustar el proxy.

---

## 4. Secuencia de deploy

Ejecutar en orden, desde la sesión SSH, como usuario con permisos de Docker.

```bash
# 4.1 — código
sudo mkdir -p /opt/relevamiento-esquel
sudo chown "$USER" /opt/relevamiento-esquel
git clone <URL_DEL_REPOSITORIO> /opt/relevamiento-esquel
cd /opt/relevamiento-esquel

# 4.2 — configuración
cp .env.example .env
openssl rand -base64 24 | tr -d '\n' > /tmp/pgpass
openssl rand -hex 32   | tr -d '\n' > /tmp/sesssecret
PGPASS="$(cat /tmp/pgpass)"; SESS="$(cat /tmp/sesssecret)"
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${PGPASS}|" .env
sed -i "s|^DATABASE_URL=.*|DATABASE_URL=postgres://relevamiento:${PGPASS}@db:5432/relevamiento|" .env
sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=${SESS}|" .env
sed -i "s|^PORT=.*|PORT=8137|" .env                      # el puerto de la sección 3
sed -i "s|^APP_BIND=.*|APP_BIND=127.0.0.1|" .env         # si hay proxy inverso con TLS
sed -i "s|^APP_BASE_URL=.*|APP_BASE_URL=https://DOMINIO_REAL|" .env
sed -i "s|^NODE_ENV=.*|NODE_ENV=production|" .env
shred -u /tmp/pgpass /tmp/sesssecret
chmod 600 .env

# 4.3 — verificar que el compose interpola bien todo
docker compose config --quiet && echo "compose OK"

# 4.4 — construir y levantar
docker compose up -d --build

# 4.5 — esperar a que Postgres esté sano
until [ "$(docker compose ps db --format '{{.Health}}')" = "healthy" ]; do sleep 3; done
echo "base sana"

# 4.6 — migraciones y datos iniciales (idempotentes)
docker compose run --rm tools npm run db:migrate
docker compose run --rm tools npm run db:seed

# 4.7 — verificación
set -a; . ./.env; set +a
curl -fsS "http://127.0.0.1:${PORT}/api/health" | tee /tmp/health.json
```

_Respuesta esperada de 4.4:_ dos servicios `Started` (`db` y `app`).
_Respuesta esperada de 4.6:_ `✔ Schemas analitica e identificada verificados.` y
`✔ Migraciones aplicadas.` (en la versión 0.1.0 todavía no hay migraciones: informa
`Todavía no hay migraciones en ./drizzle`, lo cual es correcto para esta fase).
_Respuesta esperada de 4.7:_ ver sección 5.

---

## 5. Healthcheck

**Endpoint:** `GET /api/health`

Respuesta sana — código **200**:

```json
{
  "estado": "ok",
  "servicio": "relevamiento-barrial-esquel",
  "version": "0.1.0",
  "timestamp": "2026-09-18T15:59:29.210Z",
  "uptimeSegundos": 6,
  "base_de_datos": { "estado": "ok", "latenciaMs": 11 }
}
```

Respuesta con la base caída — código **503** (la app está viva, pero no sirve):

```json
{
  "estado": "degradado",
  "base_de_datos": { "estado": "error", "latenciaMs": 7, "detalle": "connect ECONNREFUSED ..." }
}
```

Variante de liveness, sin tocar Postgres, siempre **200** si el proceso está arriba:

```bash
curl -fsS "http://127.0.0.1:${PORT}/api/health?db=skip"
```

Desde el host, con el script del repo:

```bash
docker compose exec app node -e "const p=process.env.PORT;fetch('http://127.0.0.1:'+p+'/api/health').then(r=>r.text()).then(t=>{console.log(t)})"
docker compose ps        # la columna STATUS debe decir (healthy) para app y db
```

El contenedor tiene `HEALTHCHECK` propio: cada 30 s consulta el mismo endpoint. Un
contenedor `unhealthy` significa app viva pero base inalcanzable, o app caída.

---

## 6. Primer usuario admin

El rol `admin` es el único con acceso al schema `identificada` y **toda** su actividad
de cruce queda registrada en `audit_log`. Creá uno solo, nominal (no compartido).

```bash
docker compose run --rm \
  -e ADMIN_USUARIO="apellido.nombre" \
  -e ADMIN_PASSWORD="$(openssl rand -base64 18)" \
  tools npm run admin:create
```

El comando imprime el usuario creado (nunca la contraseña en claro: guardala del
`openssl` antes de ejecutarlo, o pasá una elegida por la persona).

> **Estado en la versión 0.1.0 (fase 0):** el comando existe pero responde
> `Todavía no disponible: la creación de usuarios llega en la fase 4` y termina con
> código 1. Es el comportamiento esperado hasta que se despliegue la fase 4. No es un
> error de deploy.

---

## 7. Backup y restore

### 7.1 Backup manual

```bash
cd /opt/relevamiento-esquel
docker compose run --rm tools bash scripts/backup.sh
ls -lh backups/ | tail -3
```

Genera `backups/relevamiento-AAAAMMDD-HHMMSS.dump` (formato custom de Postgres,
permisos `600`) y purga los que superan `BACKUP_RETENCION_DIAS`.

### 7.2 Backup automático diario

```bash
( crontab -l 2>/dev/null; \
  echo "15 3 * * * cd /opt/relevamiento-esquel && docker compose run --rm tools bash scripts/backup.sh >> /var/log/relevamiento-backup.log 2>&1" \
) | crontab -
crontab -l | grep relevamiento
```

Los dumps contienen datos personales: replicalos a otro destino cifrado y verificá cada
tanto que se pueden restaurar.

### 7.3 Restore

**Destructivo: pisa los datos actuales.** Hacé un backup antes de restaurar.

```bash
cd /opt/relevamiento-esquel
docker compose run --rm tools bash scripts/backup.sh          # red de seguridad
CONFIRMAR=si docker compose run --rm -e CONFIRMAR=si tools \
  bash scripts/restore.sh backups/relevamiento-20260918-031500.dump
docker compose restart app
curl -fsS "http://127.0.0.1:${PORT}/api/health"
```

Sin `CONFIRMAR=si` el script no hace nada y termina con código 2.

---

## 8. Checklist de deploy exitoso

Marcá todo. Si algo falla, no des el deploy por bueno.

```bash
cd /opt/relevamiento-esquel && set -a && . ./.env && set +a
```

- [ ] `docker compose ps` muestra `db` y `app` en `running (healthy)`.
- [ ] `curl -fsS "http://127.0.0.1:${PORT}/api/health"` devuelve **200** con
      `"estado":"ok"` y `base_de_datos.estado = "ok"`.
- [ ] `curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/"` devuelve `200`.
- [ ] Los schemas existen:
      `docker compose exec db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tc "select nspname from pg_namespace where nspname in ('analitica','identificada')"`
      devuelve las dos filas.
- [ ] El volumen persiste: `docker compose restart db && sleep 15 && curl -fsS "http://127.0.0.1:${PORT}/api/health"` sigue en `ok`.
- [ ] El puerto publicado es el de `.env`: `docker compose port app "$PORT"` responde.
- [ ] Postgres **no** está publicado al exterior: `ss -ltn | grep ':5432'` no devuelve
      nada en la interfaz pública.
- [ ] `.env` tiene permisos `600` y no está en git: `git status --porcelain .env` vacío.
- [ ] `SESSION_SECRET` y `POSTGRES_PASSWORD` no son los valores de `.env.example`.
- [ ] Hay TLS válido delante y `APP_BASE_URL` empieza con `https://`.
- [ ] `curl -sI https://DOMINIO_REAL/ | head -1` devuelve `200` y las cabeceras incluyen
      `X-Frame-Options: DENY` y `X-Content-Type-Options: nosniff`.
- [ ] El backup corre: `docker compose run --rm tools bash scripts/backup.sh` deja un
      archivo en `backups/`.
- [ ] La tarea de backup quedó en `crontab -l`.
- [ ] (Desde la fase 4) Existe un usuario `admin` nominal y se puede iniciar sesión.

---

## 9. Actualizar a una versión nueva

```bash
cd /opt/relevamiento-esquel
docker compose run --rm tools bash scripts/backup.sh     # siempre antes
git pull
docker compose up -d --build
docker compose run --rm tools npm run db:migrate
curl -fsS "http://127.0.0.1:${PORT}/api/health"
```

Las migraciones son versionadas y aditivas: se pueden correr en cada deploy sin
duplicar efectos.

---

## 10. Problemas frecuentes

| Síntoma                                                       | Causa probable                                             | Qué hacer                                                                                                                         |
| ------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `docker compose up` falla con `Falta PORT en .env`            | `.env` incompleto o no está en la raíz                     | Copiar `.env.example` y completar                                                                                                 |
| `Error starting userland proxy: bind: address already in use` | El `PORT` elegido está ocupado                             | Elegir otro (sección 3) y `docker compose up -d`                                                                                  |
| `/api/health` devuelve 503 `degradado`                        | Postgres no arrancó o `DATABASE_URL` mal armada            | `docker compose logs db --tail 50`; revisar usuario, contraseña y host `db`                                                       |
| La app no levanta y el log dice `Configuración inválida`      | Falta una variable obligatoria o `SESSION_SECRET` es corto | El mensaje lista exactamente qué falta                                                                                            |
| `role "relevamiento" does not exist`                          | El volumen se creó con otra contraseña/usuario             | Si la base está vacía: `docker compose down -v` y volver a levantar. **Con datos: restaurar de backup, nunca borrar el volumen.** |
| Las migraciones dicen `Todavía no hay migraciones`            | Versión 0.1.0 (fase 0)                                     | Correcto para esta fase                                                                                                           |
| `permission denied` al escribir backups                       | Carpeta `backups/` de otro usuario                         | `sudo chown -R "$USER" backups`                                                                                                   |

Logs:

```bash
docker compose logs app --tail 100 -f
docker compose logs db  --tail 100
```

---

## 11. Qué NO hacer

- No publicar el puerto de Postgres al exterior ni agregarle `ports:` al servicio `db`.
- No servir la aplicación por HTTP plano fuera de `localhost`.
- No commitear `.env`, los dumps de `backups/` ni ningún archivo con datos de vecinos.
- No usar `docker compose down -v` en producción: borra el volumen con todos los datos.
- No poner `MAIL_TRANSPORT=smtp` en ambientes de prueba: se le mandarían correos reales a
  vecinos reales.
- No compartir una sola cuenta `admin` entre varias personas: la auditoría del cruce
  ticket ↔ identidad deja de servir.
