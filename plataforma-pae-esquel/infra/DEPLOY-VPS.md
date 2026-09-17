# Despliegue en VPS

## Supuestos

- VPS con Linux, 2 vCPU / 4 GB RAM / 40 GB de disco es suficiente de sobra para esta escala.
- Docker y Docker Compose instalados.
- El stack expone **un solo puerto: `13787`**. La base de datos **no** se publica.

## Puesta en marcha

```bash
git clone <repo> trocha && cd trocha/infra
cp .env.example .env

# generar secretos reales
sed -i "s|POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -base64 32)|" .env
sed -i "s|AUTH_SECRET=.*|AUTH_SECRET=$(openssl rand -base64 48)|" .env
sed -i "s|BACKUP_PASSPHRASE=.*|BACKUP_PASSPHRASE=$(openssl rand -base64 32)|" .env

# ajustar APP_URL a la IP o dominio real
docker compose up -d --build
docker compose exec app npx prisma migrate deploy
docker compose exec app npm run seed:catalogos   # barrios y juntas vecinales
```

Verificar: `curl -s http://localhost:13787/api/salud`

## Cortafuegos

```bash
ufw allow 22/tcp
ufw allow 13787/tcp
ufw enable
```

Nada más. Si más adelante se asigna un dominio institucional, se abren 80 y 443, se
reemplaza el bloque del `Caddyfile` por el nombre de dominio y Caddy resuelve el
certificado TLS solo.

## Tipografías autoalojadas — no es un detalle estético

**La aplicación no debe cargar fuentes ni scripts desde una CDN de terceros.** Dos razones:

1. **Protección de datos.** Cada visita a una CDN externa entrega la dirección IP del
   estudiante a un tercero. En un sistema que maneja datos de menores y de población
   vulnerable, eso es una transferencia de datos que nadie autorizó y que habría que
   poder justificar.
2. **Funcionamiento real.** Las sedes vecinales tienen conectividad irregular. Una
   dependencia externa convierte una página lenta en una página rota.

Las fuentes se descargan una vez, se sirven desde `/public/fonts` y la política de
contenido del `Caddyfile` bloquea cualquier origen externo. *(El prototipo de
`prototipo/` sí usa una CDN por comodidad; la aplicación real, no.)*

## Respaldos — el control que más veces salva un proyecto

```bash
# /etc/cron.daily/trocha-backup
docker compose exec -T db pg_dump -U trocha trocha \
  | gzip \
  | openssl enc -aes-256-cbc -pbkdf2 -pass pass:"$BACKUP_PASSPHRASE" \
  > /backups/trocha-$(date +%F).sql.gz.enc
find /backups -name 'trocha-*.enc' -mtime +30 -delete
```

Y además, el archivo cifrado se copia **fuera del servidor**. Un respaldo que vive en
la misma máquina que la base no es un respaldo.

> ### Prueba mensual de restauración
>
> **Un respaldo que nunca se restauró no es un respaldo: es una carpeta.**
> Una vez por mes, restaurar el último respaldo en una base descartable y verificar
> que el conteo de filas coincide. Va en el calendario, con responsable asignado.

## Actualizaciones

```bash
git pull
docker compose up -d --build
docker compose exec app npx prisma migrate deploy
```

Las migraciones son aditivas. **Nunca se borra una columna en la misma versión que deja
de usarla**: primero se deja de escribir, se despliega, se verifica, y recién en la
versión siguiente se elimina. En un sistema que administra el acceso a un beneficio,
una migración destructiva mal hecha no es un incidente técnico: es una familia que no
cobra.

## Observabilidad mínima

| Qué | Cómo |
|---|---|
| Salud de la aplicación | `GET /api/salud` (verifica también la base) |
| Logs | `docker compose logs -f app` — estructurados en JSON |
| Espacio en disco | Alerta al 80%; las evidencias fotográficas son lo que más crece |
| Certificado | Automático con Caddy cuando hay dominio |
| Respaldo del día | El cron deja un archivo de estado que se revisa semanalmente |
