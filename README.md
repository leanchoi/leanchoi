# Esquel LAB — sitio web de la Cohorte 01

Sitio del Laboratorio de Destino Esquel: convocatoria y postulación a **Esquel Acelera** (urbano) y **Raíz** (rural), media kit para prensa, sección para la ciudadanía, y un CRM liviano en `/admin` para gestionar las postulaciones.

El research completo, la arquitectura del sitio y las decisiones de diseño están documentados en [`docs/00-investigacion-y-plan.md`](docs/00-investigacion-y-plan.md) — léelo primero si vas a tocar contenido o estructura.

## Stack

PHP 8+ (PDO) · MySQL · HTML/CSS/JS vanilla, sin build step. Elegido así a propósito porque el sitio se despliega en un hosting compartido de Hostinger, que sirve el repositorio directo vía Git — no hay Node, no hay bundler, no hay SSR.

```
/                     Home
/postulacion/         Formulario de postulación (multi-etapa)
/medios/              Sala de prensa / media kit
/esquel-es-turistico/ Sección para vecinos
/admin/               Panel de gestión de postulaciones (CRM)
includes/             Backend compartido: DB, auth, CSRF, helpers, layout
assets/               CSS, JS y assets de marca
sql/                  schema.sql + seed.sql
```

## Puesta en marcha local

1. Necesitás PHP 8+ con `pdo_mysql`, y una base MySQL/MariaDB (local o remota).
2. Copiá `includes/config.example.php` a `includes/config.php` y completá los datos de conexión. **`includes/config.php` no se sube al repo** (está en `.gitignore`).
3. Cargá el esquema y los datos semilla:
   ```
   mysql -u tu_usuario -p tu_base < sql/schema.sql
   mysql -u tu_usuario -p tu_base < sql/seed.sql
   ```
4. Levantá el servidor embebido de PHP desde la raíz del proyecto:
   ```
   php -S localhost:8000
   ```
5. Entrá a `http://localhost:8000/admin/login.php` con:
   - **usuario:** `admin`
   - **contraseña:** `admin123`

   El sistema te va a forzar a cambiarla en el primer ingreso — es la protección esperada para no dejar la credencial semilla activa en producción.

## Deploy en Hostinger (Git)

1. En hPanel, creá el sitio: **Websites → Add website → PHP/HTML personalizado** (no elijas WordPress).
2. Creá una base de datos MySQL desde **Bases de datos → MySQL** y anotá host, nombre, usuario y contraseña.
3. Entrá a phpMyAdmin de esa base y ejecutá, en este orden, `sql/schema.sql` y `sql/seed.sql` (pestaña Importar o SQL).
4. En el sitio recién creado: **Avanzado → Git → Continuar con GitHub**, autorizá la integración, elegí este repositorio y la rama a desplegar. Directorio raíz de despliegue: `public_html` (el valor por defecto).
5. Activá el **despliegue automático** (Auto Deployment) para que cada push a la rama elegida actualice el sitio solo.
6. Por SSH o desde el Administrador de archivos de hPanel, subí un `includes/config.php` real (a partir de `includes/config.example.php`) con las credenciales de la base creada en el paso 2. **Nunca subas ese archivo al repositorio.**
7. Entrá a `/admin/login.php` con `admin` / `admin123`, cambiá la contraseña de inmediato, y desde `/admin/usuarios.php` cargá al resto del equipo con su rol correspondiente (`admin`, `editor` o `viewer`).

## Roles del panel

| Rol | Puede |
|---|---|
| `viewer` | Ver postulaciones (lista y tarjetas) y exportar CSV |
| `editor` | Todo lo de `viewer` + cambiar estado y agregar notas |
| `admin` | Todo lo de `editor` + gestionar usuarios y resetear contraseñas |

## Fechas del programa

Están centralizadas en `includes/config.php` (`FECHA_APERTURA_CONVOCATORIA`, `FECHA_CIERRE_CONVOCATORIA`, `FECHA_INICIO_TRABAJO_TECNICO`, `FECHA_CIERRE_COHORTE`). Si estas fechas cambian, se actualizan en un solo lugar y todo el sitio (countdown del home, textos de `/postulacion`, cierre automático del formulario) se ajusta solo.
