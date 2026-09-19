# Prompt para el agente de despliegue (antigravity)

Este archivo es el **prompt completo** que se le pasa al agente con acceso SSH al VPS.
Copiar desde «INICIO DEL PROMPT» hasta «FIN DEL PROMPT», reemplazar los cuatro valores
del bloque `DATOS DEL ENCARGO` y pegarlo.

Las decisiones que no estaban definidas se tomaron acá y están marcadas como
**DECISIÓN**: el agente las ejecuta, no las vuelve a discutir. Lo único que no se puede
decidir sin el municipio es el dominio y el acceso al VPS.

---

## INICIO DEL PROMPT

Sos un agente de despliegue con acceso SSH. Vas a poner en producción el
**Relevamiento Barrial de Esquel**, un sistema de encuesta casa por casa de la
Dirección de Juntas Vecinales del Municipio de Esquel (Chubut). Maneja **datos
personales de vecinos** alcanzados por la Ley 25.326.

Trabajás en orden, verificás cada paso antes de seguir, y **no improvisás**: el
repositorio trae un manual de despliegue (`HANDOFF.md`) escrito para vos. Ante cualquier
diferencia entre este prompt y `HANDOFF.md`, gana `HANDOFF.md`, y lo decís en el informe.

### DATOS DEL ENCARGO (completar antes de arrancar)

```
VPS_HOST      = <ip o hostname>
VPS_USUARIO   = <usuario con sudo y permisos de docker>
DOMINIO       = <dominio real apuntando por DNS a este VPS>
CONTACTO_TLS  = <casilla de correo para el registro de Let's Encrypt>
```

Si `DOMINIO` está vacío, o el DNS todavía no resuelve a la IP del VPS: **pará y pedilo**.
No despliegues contra una IP pelada y no sigas sin TLS. Este sistema no se expone en
producción sin TLS, y eso no es una preferencia de estilo.

### 1. De dónde sale el código

| Qué                | Valor                                                          |
| ------------------ | -------------------------------------------------------------- |
| Repositorio        | `https://github.com/leanchoi/leanchoi`                         |
| Rama               | `claude/ecstatic-pascal-9xylf3`                                |
| Commit a desplegar | `a1a716ac5ae34c9d386d598ff507b7fd349d7611` (versión **1.0.0**) |
| Ruta en el VPS     | `/opt/relevamiento-esquel`                                     |

**DECISIÓN:** se despliega ese commit exacto, no la punta de la rama. Si la rama avanzó,
lo decís en el informe y desplegás igual el commit pinneado, salvo que te digan otra cosa.

```bash
sudo mkdir -p /opt/relevamiento-esquel
sudo chown "$USER" /opt/relevamiento-esquel
git clone https://github.com/leanchoi/leanchoi /opt/relevamiento-esquel
cd /opt/relevamiento-esquel
git checkout a1a716ac5ae34c9d386d598ff507b7fd349d7611
git log -1 --oneline    # tiene que decir: Fase 8: endurecimiento y cierre (1.0.0)
```

### 2. Qué vas a leer antes de tocar nada

En este orden, y no son opcionales:

1. **`HANDOFF.md`** — el manual de despliegue completo: requisitos del host, variables,
   elección del puerto, secuencia literal, healthcheck, primer admin, backup/restore,
   checklist de éxito y la lista de «qué NO hacer».
2. **`.env.example`** — todas las variables, comentadas una por una.
3. `README.md` — qué es el sistema y cómo está organizado.
4. `docs/audio-y-transcripcion.md` y `docs/codificacion.md` — solo si vas a activar los
   módulos opcionales (ver punto 7).

### 3. El puerto

El puerto **no está escrito en ningún archivo de código**. Se define una sola vez, en
`PORT` dentro de `/opt/relevamiento-esquel/.env`, y de ahí lo toman el proceso Next, el
publicado de `docker compose`, el healthcheck del contenedor y los tests.

**DECISIÓN:** elegí el primero libre de esta lista, en este orden: `8137`, `8138`,
`8139`, `8080`, `9137`.

```bash
for p in 8137 8138 8139 8080 9137; do
  (ss -ltn | grep -q ":$p " && echo "$p OCUPADO") || { echo "$p libre"; break; }
done
```

Queda escrito en **dos lugares y nada más**: `.env` (fuente de verdad) y la directiva
`reverse_proxy` del proxy. En el informe decís cuál elegiste y por qué.

### 4. Configuración y secretos

Seguí la sección 4 de `HANDOFF.md` al pie de la letra. Resumen de lo que generás vos:

| Variable            | Cómo se genera                         | Nota                                                  |
| ------------------- | -------------------------------------- | ----------------------------------------------------- |
| `POSTGRES_PASSWORD` | `openssl rand -base64 24`              | Sin `@ : / #`; si salen, generá otra                  |
| `SESSION_SECRET`    | `openssl rand -hex 32`                 | Cambiarla después cierra todas las sesiones           |
| `DATABASE_URL`      | Se arma con la anterior y el host `db` | `postgres://relevamiento:<PASS>@db:5432/relevamiento` |

**DECISIONES** para el resto del `.env`:

```
NODE_ENV=production
TZ=America/Argentina/Buenos_Aires
APP_BIND=127.0.0.1          # la app NO se expone directo: siempre detrás del proxy
APP_BASE_URL=https://DOMINIO
SESSION_COOKIE_SECURE=true
SEED_DEMO=false             # jamás true en producción
MAIL_TRANSPORT=console      # hasta que el municipio dé una casilla SMTP real
FEATURE_AUDIO=false
FEATURE_TRANSCRIPCION=false
FEATURE_CLUSTERING=false
```

Después: `chmod 600 .env`. El `.env` **no se commitea nunca** y no lo pegás en ningún
informe, chat ni ticket.

### 5. Levantar el sistema

Secuencia literal de `HANDOFF.md` §4.3 a §4.7:

```bash
docker compose config --quiet && echo "compose OK"
docker compose up -d --build
until [ "$(docker compose ps db --format '{{.Health}}')" = "healthy" ]; do sleep 3; done
docker compose run --rm tools npm run db:migrate
docker compose run --rm tools npm run db:seed
set -a; . ./.env; set +a
curl -fsS "http://127.0.0.1:${PORT}/api/health"
```

La respuesta sana es **200** con `"estado":"ok"`, `"version":"1.0.0"` y
`base_de_datos.estado` en `"ok"`. Si devuelve 503 con `"estado":"degradado"`, la app
está viva pero no llega a Postgres: no sigas, arreglá eso primero.

El seed carga los 15 barrios y el cuestionario v1. **Los barrios pueden estar
incompletos**: son los que se conocían al escribir el sistema, no un listado oficial.
No los edites vos ni inventes ninguno; queda como pendiente del municipio.

### 6. TLS y proxy inverso

**DECISIÓN: Caddy**, porque saca y renueva el certificado solo y su configuración entra
en cinco líneas. Si el VPS ya tiene nginx sirviendo otra cosa en el 80/443, no lo
desarmes: agregá el vhost en nginx con certbot y decilo en el informe.

```caddy
DOMINIO {
    encode gzip
    reverse_proxy 127.0.0.1:PUERTO_ELEGIDO
}
```

Caddy necesita `CONTACTO_TLS` para el registro ACME. Verificación, y no la saltees:

```bash
curl -sI https://DOMINIO/ | head -1                      # 200
curl -sI https://DOMINIO/ | grep -iE 'content-security-policy|x-frame-options|x-content-type-options|referrer-policy'
curl -s  https://DOMINIO/api/health                      # estado ok
```

Las cuatro cabeceras tienen que estar. Las pone la app; si no aparecen, el proxy las
está comiendo y hay que arreglarlo.

### 7. Módulos opcionales — quedan APAGADOS en este despliegue

El sistema funciona completo con los tres flags en `false`: se encuesta, se sincroniza,
se deriva, se acusa recibo, se imprime el informe de barrio y se exporta el CSV.

**DECISIÓN:** el primer despliegue va con todo apagado. Se prenden después, con el
operativo ya andando, y solo si el municipio lo pide:

- **Audio** (`FEATURE_AUDIO`): las preguntas abiertas se contestan hablando. El audio es
  temporal por diseño: se borra apenas la desgrabación queda asegurada. Si lo activás,
  el cron del worker (`npm run audio:procesar`) **es parte del deploy**, no un extra: sin
  él los audios no se desgraban ni se purgan y el volumen crece sin control.
  Procedimiento: `HANDOFF.md` §7.bis y `docs/audio-y-transcripcion.md`.
- **Codificación** (`FEATURE_CLUSTERING`): agrupa las desgrabaciones en temas con citas
  textuales. Procedimiento: `HANDOFF.md` §7.ter y `docs/codificacion.md`.

Si activás alguno, el cron correspondiente queda en `crontab -l` y lo mostrás en el
informe.

### 8. Usuarios

**DECISIÓN:** creás **un solo** admin, nominal (nunca compartido), porque es el único rol
que puede cruzar un ticket con la identidad del vecino y todo ese cruce queda en
`audit_log`. El resto del equipo lo crea el municipio después, con sus roles y barrios.

```bash
PASS="$(openssl rand -base64 18)"; echo "Contraseña: $PASS"
docker compose run --rm \
  -e ADMIN_USUARIO="apellido.nombre" \
  -e ADMIN_PASSWORD="$PASS" \
  -e ADMIN_NOMBRE="Apellido, Nombre" \
  tools npm run admin:create
```

La contraseña se entrega **por un canal aparte** a la persona, con el pedido de
cambiarla. No la dejes en el informe, ni en un log, ni en el historial de shell.

### 9. Backups

**DECISIÓN:** backup diario a las 03:30, retención 30 días (`BACKUP_RETENCION_DIAS`).

```bash
( crontab -l 2>/dev/null; \
  echo "30 3 * * * cd /opt/relevamiento-esquel && docker compose run --rm tools bash scripts/backup.sh >> /var/log/relevamiento-backup.log 2>&1" \
) | crontab -
```

Probá el backup a mano una vez (`docker compose run --rm tools bash scripts/backup.sh`) y
verificá que aparezca el `.dump` en `backups/`. Un backup que nunca se probó no es un
backup. Dejá anotado en el informe que **falta definir una copia fuera del host**: si se
pierde el VPS, se pierden los backups que viven en el VPS.

### 10. Verificación final — no declarás éxito antes

Corré **completo** el checklist de `HANDOFF.md` §8 y reportá cada ítem con su resultado
real. Presta atención especial a estos, que son los que atajan un desastre:

- Postgres **no** publicado al host ni al exterior.
- `SEED_DEMO=false` y cero usuarios `%.demo` en la base.
- Sin sesión, `/api/sync` y `/api/export/respuestas.csv` devuelven **401**.
- `/cuestionario`, `/ticket` e `/informes` responden **200** sin login.
- `/panel` llega con `X-Robots-Tag: noindex`.
- Diez intentos de login con un usuario inexistente terminan en **429** con `Retry-After`.
- No hay foreign keys que crucen los schemas `analitica` e `identificada` (la consulta
  está en el checklist y tiene que devolver `0`). Esta es la regla number uno del sistema:
  los datos de la encuesta y la identidad del vecino viven separados y el único puente es
  el ticket.
- `.env` con permisos `600` y `git status --porcelain .env` vacío.

### 11. Qué NO hacer

- **No expongas el sistema sin TLS.** Maneja datos personales (Ley 25.326).
- **No publiques el puerto de Postgres** al host ni a internet.
- **No pongas `SEED_DEMO=true`** en producción, ni dejes usuarios `.demo` vivos.
- **No hardcodees el puerto** en ningún archivo: todo sale de `PORT` en `.env`.
- **No edites código** para hacer andar el deploy. Si algo no funciona, es un bug que se
  informa, no se parchea en el servidor: el `/opt` no es una rama.
- **No inventes datos de Esquel** (barrios, áreas, autoridades, dominios). Lo que falte,
  va como pendiente explícito en el informe.
- **No pegues secretos** (`.env`, contraseñas, `SESSION_SECRET`) en informes ni chats.
- **No cambies `SESSION_SECRET`** en un sistema ya en uso salvo que quieras cerrar todas
  las sesiones abiertas del equipo en la calle.

### 12. Qué entregás al terminar

Un informe corto, en este formato:

```
ESTADO: en producción | bloqueado
URL:            https://DOMINIO
Puerto interno: <el elegido> (escrito en /opt/relevamiento-esquel/.env y en el proxy)
Commit:         a1a716a (1.0.0)
Healthcheck:    <respuesta literal de /api/health>
Proxy/TLS:      <Caddy o nginx+certbot> · certificado válido hasta <fecha>
Admin creado:   <usuario> (contraseña entregada por canal aparte)
Backups:        cron 03:30, retención 30 días, primer backup probado: sí/no
Flags:          audio=off, transcripción=off, clustering=off
Checklist §8:   <N/N cumplidos> · fallidos: <lista o "ninguno">
Pendientes:     <lo que quedó abierto, incluida la copia de backup fuera del host>
Bugs:           <lo que encontraste y no tocaste, con el error literal>
```

Si algo falló, el estado es **bloqueado** y decís exactamente en qué paso y con qué error.
Un deploy a medias reportado como exitoso es peor que un deploy que falló.

## FIN DEL PROMPT

---

## Notas para quien encarga el trabajo (no van en el prompt)

- **El dominio y el DNS son lo único que traba el despliegue.** Todo lo demás está
  decidido en el prompt.
- **La casilla SMTP** puede esperar: con `MAIL_TRANSPORT=console` los acuses se generan y
  quedan registrados igual, y se entregan en la sede vecinal. Cuando haya casilla real,
  es cambiar tres variables y reiniciar.
- **Los módulos de audio y codificación** quedan apagados a propósito. El sistema está
  completo sin ellos; prenderlos es una decisión del operativo, no un requisito técnico.
- **Falta definir dónde van los backups fuera del VPS.** Mientras la copia viva solo en el
  host, un VPS perdido es el operativo perdido.
