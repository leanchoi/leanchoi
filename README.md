# Arrayán Workflows

Réplica self-hosted de Airtable: bases de datos colaborativas con vistas Grilla,
Kanban, Calendario, Galería y Formularios públicos.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind (tema oscuro slate/teal)
- SQLite (better-sqlite3) con migraciones idempotentes
- NextAuth v4 (credenciales + JWT), usuarios administrados por un admin
- Docker + docker-compose (puerto externo **3011**)

## Features

- Bases → tablas → campos de 17 tipos (texto, número, moneda, porcentaje,
  valoración, casilla, selección única/múltiple, fecha, URL, email, teléfono,
  adjuntos hasta 50MB con preview, colaborador, vínculo entre tablas, fecha de creación)
- Vistas: Grilla, Kanban (drag & drop), Calendario, Galería y Formulario público
  con link compartible
- Filtros, orden, agrupado, campos ocultos, alto de fila y **colores condicionales
  de registros** por vista; vistas personales
- Colaboradores por base con roles (editor / comentarista / lector); el admin ve todo
- Registro expandido con comentarios y @menciones
- Notificaciones internas con campanita (menciones, asignaciones, comentarios,
  bases compartidas, respuestas de formularios)
- Mi agenda: calendario personal con todo lo que te asignaron o creaste
- Panel de usuarios (hasta 50) para el admin; perfil con foto, nombre y contraseña
- Exportar CSV desde cualquier vista

## Deploy en el VPS

```bash
cd ~ && git clone <repo> arrayan && cd arrayan && docker compose up -d --build
```

Actualización:

```bash
cd ~/arrayan && git pull && docker compose up -d --build
```

La app queda en `http://TU_IP:3011`. Los datos (SQLite + archivos subidos)
viven en el volumen `arrayan_data` y sobreviven rebuilds.

## Credenciales iniciales

- Usuario: `admin`
- Contraseña: `arrayan2026`

Cambiala desde **Mi perfil** después del primer ingreso.
