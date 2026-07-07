# TROCHI · Gestor de Proyectos Turísticos

Trello + Airtable self-hosted en una sola app: tableros con listas y tarjetas,
bases con tablas y vistas (grilla, kanban, calendario, galería, Gantt y
formularios públicos), rankings, analytics para admins y administración
multi-rama con cupos y vencimientos.

- **Stack**: Next.js 14 + TypeScript + SQLite (better-sqlite3) + NextAuth v4
- **Puerto interno del contenedor**: `4000` (fijo)
- **Puerto del VPS**: `HOST_PORT` (configurable, default `3010`)

---

## Despliegue en VPS (Docker, acceso directo por IP:puerto)

### 1. Antes de elegir el puerto: ¿qué está libre?

```bash
docker ps --format 'table {{.Names}}\t{{.Ports}}'   # puertos ya usados por contenedores
sudo ss -tlnp | grep LISTEN                          # puertos ocupados en el host
```

Si el puerto que querés está ocupado, elegí otro y ponelo en `.env`.

### 2. Configurar y arrancar

```bash
cp .env.example .env    # editá HOST_PORT, NEXTAUTH_SECRET y NEXTAUTH_URL
docker compose up -d --build
```

Sin `.env`, los defaults son `HOST_PORT=3010` y un secret de desarrollo
(cambialo en producción). La app escucha en `0.0.0.0:4000` dentro del
contenedor y los datos persisten en el volumen `leanboard-data`.

### 3. Verificación en 3 capas

```bash
# Capa 1 — dentro del contenedor (¿la app arrancó y escucha?)
docker compose logs --tail=50
docker compose exec leanboard wget -qO /dev/null -S http://localhost:4000/login 2>&1 | head -1
#   (la imagen es Alpine: hay wget, no curl. Esperado: HTTP/1.1 200 OK)

# Capa 2 — desde el host del VPS (¿el mapeo de puertos funciona?)
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:${HOST_PORT:-3010}/login

# Capa 3 — desde FUERA (¿el firewall deja pasar?)  ← correr desde TU computadora
curl -v http://IP_DEL_VPS:3010/login
```

**No des por bueno el despliegue hasta que la Capa 3 devuelva 200.**

### 4. Firewall (la causa nº1 de "adentro anda, desde afuera no")

- **Firewall del sistema** (si `ufw` está activo):

  ```bash
  sudo ufw allow 3010/tcp && sudo ufw reload
  ```

- **Firewall del PROVEEDOR** (Hostinger, Hetzner, Oracle, AWS, DigitalOcean…):
  además hay que abrir el puerto en el **panel web del proveedor** (security
  group / firewall de red). Eso **no se ve desde el VPS**: aunque `ufw` esté
  abierto, si el panel lo bloquea, desde fuera no entra nada.

### 5. Tabla de diagnóstico

| Síntoma                                    | Causa probable             | Arreglo                          |
|--------------------------------------------|----------------------------|----------------------------------|
| "port is already allocated" al levantar    | Puerto host ocupado        | Cambiá `HOST_PORT` en `.env`     |
| curl en el host da 000/refused             | App escucha en 127.0.0.1   | `HOST=0.0.0.0` en el contenedor  |
| Dentro/host OK pero desde fuera nada       | Firewall (ufw o proveedor) | Abrí el puerto en **ambos**      |
| 200 dentro del contenedor, 000 en el host  | Mapeo de puertos mal       | Revisá `"HOST_PORT:4000"`        |

### Actualización

```bash
cd ~/leanboard && git pull && docker compose up -d --build
```

---

## Credenciales iniciales

- Usuario `admin`, contraseña `admin123` (cambiala tras el primer login).

## Datos

Todo (SQLite + archivos subidos) vive en el volumen `leanboard-data`,
montado en `/data`. Sobrevive rebuilds y reinicios.
