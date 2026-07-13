# Deploy en VPS con Docker

La app queda publicada en el **puerto 3015** del VPS (configurable con `APP_PORT` en `.env`).
Postgres corre como contenedor interno del mismo compose (no expone puertos).

## 1. Primer deploy

```bash
git clone -b claude/tourism-marketplace-platform-q20zm9 https://github.com/leanchoi/leanchoi.git andar
cd andar
cp .env.example .env
nano .env
```

Completar en `.env` como mínimo:

```ini
AUTH_SECRET=$(openssl rand -base64 32)     # generarlo, no dejar el default
NEXT_PUBLIC_BASE_URL=https://andar.tudominio.com
MASTER_DOMAIN=andar.tudominio.com
PLATFORM_DOMAIN=andar.tudominio.com        # para subdominios de operadores
POSTGRES_PASSWORD=una-clave-fuerte
# Mercado Pago (ver docs/pagos.md)
MP_CLIENT_ID=...
MP_CLIENT_SECRET=...
MP_ACCESS_TOKEN=...
NEXT_PUBLIC_MP_PUBLIC_KEY=...
```

Levantar:

```bash
docker compose up -d --build
docker compose logs -f app   # la primera vez corre db push + seed demo
```

App: `http://IP-DEL-VPS:3015`. El seed demo se puede desactivar con `SEED_ON_BOOT=0` en `.env`.

## 2. Reverse proxy + SSL

### Opción recomendada: Caddy (SSL automático, ideal para dominios de operadores)

`/etc/caddy/Caddyfile`:

```caddy
# dominio master
andar.tudominio.com {
    reverse_proxy localhost:3015
}

# subdominios de operadores (pepito.andar.tudominio.com) — wildcard DNS
*.andar.tudominio.com {
    reverse_proxy localhost:3015
}

# dominios PROPIOS de operadores (pepitocabalgatas.com):
# on-demand TLS emite el certificado la primera vez que entra alguien.
https:// {
    tls {
        on_demand
    }
    reverse_proxy localhost:3015
}
```

Con esto, sumar el dominio propio de un operador es: (1) el operador apunta su DNS A al VPS,
(2) vos cargás el dominio en `/master/operadores/[id]`. Nada más — el certificado sale solo.

### Opción Nginx (si ya lo usás para otros proyectos)

```nginx
server {
    listen 80;
    server_name andar.tudominio.com *.andar.tudominio.com pepitocabalgatas.com;
    location / {
        proxy_pass http://127.0.0.1:3015;
        proxy_set_header Host $host;              # CLAVE para el multi-tenant
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

`proxy_set_header Host $host` es obligatorio: el middleware rutea por ese header.
SSL con certbot por dominio (los dominios de operadores requieren `certbot -d` cada vez —
por eso Caddy es más cómodo acá).

## 3. Actualizaciones

```bash
cd andar
git pull
docker compose up -d --build
```

Los datos viven en el volumen `pgdata`; el rebuild no los toca.

## 4. Backups

```bash
docker compose exec db pg_dump -U andar andar | gzip > backup-$(date +%F).sql.gz
```

Cron sugerido: diario + copia fuera del VPS.

## 5. Checklist post-deploy

- [ ] `https://TU-DOMINIO` carga el marketplace
- [ ] Login master funciona y cambiaste la contraseña demo (o `SEED_ON_BOOT=0` desde el inicio)
- [ ] Webhook configurado en el panel de MP → `https://TU-DOMINIO/api/webhooks/mercadopago`
- [ ] OAuth redirect en MP → `https://TU-DOMINIO/api/mp/oauth/callback`
- [ ] Un operador de prueba conectó su MP y una venta de prueba repartió bien (ver `/master/pedidos`)
- [ ] Wildcard DNS `*.andar.tudominio.com` apuntado al VPS
