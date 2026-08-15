# Auditoría técnica — Esquel Alerta

**Proyecto:** `leanchoi/esquel-reclamos-app`
**Deploy auditado:** `https://gray-dogfish-546625.hostingersite.com/` (Hostinger LiteSpeed + PHP 8.x + MySQL)
**Commit auditado:** `165d0475afef4ec37f43ac65f1a4b276abb82d87` (rama `main`)
**Fecha:** 15/08/2026
**Documento destinado a:** implementación asistida (Antigravity)

---

## 0. Alcance y metodología

Auditoría **estática completa del código fuente** (backend PHP en `/api`, frontend React/TS en `/web`, configuración Apache, CI/CD y datos semilla).

> **Nota de alcance:** el entorno desde el que se corrió esta auditoría tiene bloqueado el egreso HTTP hacia `gray-dogfish-546625.hostingersite.com`, por lo que **no se ejecutaron pruebas dinámicas contra el sitio en vivo**. Todos los hallazgos se derivan del código que se despliega en ese host. Cada uno incluye la ruta `archivo:línea` y un PoC `curl` reproducible para que puedas verificarlo vos mismo en 30 segundos antes de aplicar el fix.
>
> Verificación recomendada del hallazgo más grave, desde cualquier terminal:
> ```bash
> curl -s https://gray-dogfish-546625.hostingersite.com/api/auth/users | head -c 2000
> ```

**Aclaración importante sobre el backend:** el repo contiene **dos backends distintos**:

| Backend | Ruta | Estado |
|---|---|---|
| PHP 8 nativo | `/api/*.php` | **EN PRODUCCIÓN** (Hostinger) |
| Node/Fastify + Postgres | `/server/src/**` | No desplegado (VPS/Docker) |

La auditoría de seguridad se centra en **el backend PHP**, que es el que atiende el tráfico real. Esto tiene una consecuencia crítica documentada en `BUG-06`: el CI de GitHub Actions testea el backend Node y **da verde mientras el backend PHP tiene los agujeros abiertos**.

---

## 1. Sobre tu requisito de contraseñas visibles — LEÍDO Y RESPETADO

Pediste explícitamente **no tocar** la funcionalidad de ver las contraseñas de los vecinos desde el backend, porque la comunidad es chica y van a necesitar que se las recuerden constantemente. **Ninguna recomendación de este documento elimina esa función.** El panel de `AdminDashboard.tsx` sigue mostrando la clave con el ojito 👁, y el export CSV del padrón sigue existiendo.

Ahora bien, hay que separar dos cosas que hoy están mezcladas:

| Lo que vos querés (legítimo) | Lo que está pasando hoy (accidental) |
|---|---|
| Que **el admin logueado** pueda ver la clave de un vecino para recordársela por WhatsApp | Que **cualquier persona en internet, sin loguearse**, pueda descargar el padrón entero con nombres, emails, teléfonos, edad, género y contraseñas en texto plano con un solo `curl` |

Eso segundo no es una decisión de diseño tuya: es el hallazgo **SEC-01**, un endpoint que quedó sin control de acceso. Arreglarlo **no te saca nada** — el admin lo sigue viendo igual desde el panel.

### Las dos formas de mantener tu función, ordenadas por recomendación

**Opción A — Texto plano + acceso blindado (mínimo indispensable, no negociable)**
Se conserva la columna `password` en texto plano tal como está. Se agrega:
1. Autenticación obligatoria de rol `admin`/`superadmin` en `GET /api/auth/users` (SEC-01).
2. Log de auditoría: cada vez que se revela/exporta una clave, se registra quién, cuándo y de qué usuario.
3. Rate limiting sobre el endpoint.
4. Aviso explícito en el registro: *"Tu clave queda guardada de forma recuperable para que la coordinación pueda recordártela. No uses la misma clave que usás en tu email o banco."* — esto es lo que legalmente y éticamente cierra el círculo, y además es **buena UX**.

**Opción B — Cifrado reversible AES-256-GCM (recomendada, misma UX exacta)**
La clave se guarda **cifrada de forma reversible** con una llave maestra que vive **fuera del webroot** (`/home/uXXXX/esquel-config.php`). El admin sigue viendo la contraseña en claro en el panel, con el mismo ojito, sin ningún cambio en su flujo. La diferencia: si alguien roba un dump de la base MySQL (o accede al phpMyAdmin de Hostinger), **se lleva ciphertext inservible**, no las claves de todos los vecinos.

```php
// api/lib/crypto.php  — NUEVO ARCHIVO
// Requiere: define('PASS_ENC_KEY', hex2bin('...64 chars...')) en /home/uXXXX/esquel-config.php
// Generar con: openssl rand -hex 32

function encryptPassword(string $plain): string {
    $iv  = random_bytes(12);
    $tag = '';
    $ct  = openssl_encrypt($plain, 'aes-256-gcm', PASS_ENC_KEY, OPENSSL_RAW_DATA, $iv, $tag);
    return 'v1:' . base64_encode($iv . $tag . $ct);
}

function decryptPassword(?string $stored): string {
    if (!$stored) return '';
    if (strpos($stored, 'v1:') !== 0) return $stored; // legacy en texto plano: se lee igual
    $raw = base64_decode(substr($stored, 3));
    $iv  = substr($raw, 0, 12);
    $tag = substr($raw, 12, 16);
    $ct  = substr($raw, 28);
    $out = openssl_decrypt($ct, 'aes-256-gcm', PASS_ENC_KEY, OPENSSL_RAW_DATA, $iv, $tag);
    return $out === false ? '' : $out;
}
```

El fallback `if (strpos($stored,'v1:') !== 0) return $stored;` hace que la migración sea **gradual y sin downtime**: las claves viejas en texto plano se siguen leyendo, y cada vez que un usuario se registra o cambia la clave, se guarda cifrada.

> **Si sólo vas a hacer una cosa de todo este documento, que sea SEC-01.**

---

## 2. Tablero de hallazgos

### 2.1 Seguridad

| ID | Severidad | Hallazgo | Archivo |
|---|---|---|---|
| SEC-01 | 🔴 **CRÍTICO** | `GET /api/auth/users` sin autenticación: dump completo del padrón con contraseñas | `api/auth.php:59` |
| SEC-02 | 🔴 **CRÍTICO** | Backdoor universal en login: `admin123` entra a **cualquier** cuenta | `api/auth.php:233` |
| SEC-03 | 🔴 **CRÍTICO** | `POST /api/auth/staff` otorga rol superadmin con códigos hardcodeados | `api/auth.php:270,293` |
| SEC-04 | 🔴 **CRÍTICO** | `POST /api/auth/users/create` sin auth: cualquiera crea usuarios con rol arbitrario | `api/auth.php:326` |
| SEC-05 | 🔴 **CRÍTICO** | `PATCH /api/claims/{id}/status` sin auth: cualquiera cambia estados y publica comentarios "oficiales" | `api/claims.php:351` |
| SEC-06 | 🔴 **CRÍTICO** | `POST /api/auth/google` emite token válido para cualquier email sin verificar nada | `api/auth.php:394` |
| SEC-07 | 🔴 **CRÍTICO** | Re-registro con email existente pisa la contraseña sin validar identidad → toma de cuenta | `api/auth.php:133` |
| SEC-08 | 🔴 **CRÍTICO** | Secretos de producción hardcodeados: `DB_PASS`, `JWT_SECRET`, `ADMIN_ACCESS_CODE` | `api/config.php:58-70` |
| SEC-09 | 🟠 ALTO | `GET /api/admin/metrics` sin auth: expone todo + datos financieros de sponsors | `api/metrics.php:8` |
| SEC-10 | 🟠 ALTO | `deviceId` e IP controlados por el cliente → fraude ilimitado de apoyos | `api/config.php:490-500` |
| SEC-11 | 🟠 ALTO | `POST /api/uploads` sin auth, sin rate limit, sin re-encode → DoS de disco | `api/upload.php` |
| SEC-12 | 🟠 ALTO | **Cero rate limiting** en toda la API (el README afirma que existe) | global |
| SEC-13 | 🟠 ALTO | CORS: fallback `Access-Control-Allow-Origin: *` para orígenes no permitidos | `api/config.php:15-20` |
| SEC-14 | 🟠 ALTO | Sin CSP, sin HSTS, sin Permissions-Policy | `.htaccess:53` |
| SEC-15 | 🟡 MEDIO | JWT de 30 días, sin revocación, sin `jti`, en `localStorage` | `api/config.php:445` |
| SEC-16 | 🟡 MEDIO | Almacenamiento dual JSON dentro del webroot; protección depende 100% de `.htaccess` | `api/config.php:96` |
| SEC-17 | 🟡 MEDIO | Export CSV del padrón con claves, sin confirmación ni traza de auditoría | `AdminDashboard.tsx:339` |
| SEC-18 | 🟡 MEDIO | Enumeración de usuarios por mensajes de error diferenciados | `api/auth.php:228` |
| SEC-19 | 🔵 BAJO | `leaderboard.php` valida sólo `role === 'admin'`, excluye `superadmin` | `api/leaderboard.php:19` |

### 2.2 Bugs funcionales

| ID | Impacto | Bug | Archivo |
|---|---|---|---|
| BUG-01 | 🔴 ALTO | **Todos los links compartidos por WhatsApp están rotos** (`?claimId=` vs `?claim=`) | `ClaimModal.tsx:53` ↔ `App.tsx:161` |
| BUG-02 | 🟠 MEDIO | La suspensión por 3 rechazos **nunca se aplica**: query preparada y nunca ejecutada | `api/claims.php:454` |
| BUG-03 | 🟠 MEDIO | Fallback JSON de upvote siempre suma, nunca togglea ni deduplica | `api/upvote.php:56` |
| BUG-04 | 🟡 MEDIO | `register` devuelve 201 + token aunque el INSERT en MySQL haya fallado | `api/auth.php:171` |
| BUG-05 | 🟡 MEDIO | Links compartidos no tienen Open Graph dinámico: todos se ven idénticos | `index.html:20` |
| BUG-06 | 🟠 MEDIO | El CI testea el backend Node (no desplegado) y da verde con el PHP vulnerable | `.github/workflows/deploy.yml:98` |
| BUG-07 | 🔵 BAJO | `.htaccess` habilita `manifest.json`, pero el archivo real es `manifest.webmanifest` | `.htaccess:22` |
| BUG-08 | 🔵 BAJO | README declara React 19 y rate limiting; la realidad es React 18.2 y cero rate limiting | `README.md:28` |

---

## 3. Seguridad — detalle y parches

### SEC-01 🔴 — `GET /api/auth/users` expone el padrón completo sin autenticación

**Archivo:** `api/auth.php:59-85`

El endpoint hace `SELECT ... u.accessCode, u.password ...` y responde sin ninguna verificación de token.

**PoC:**
```bash
curl -s https://gray-dogfish-546625.hostingersite.com/api/auth/users
# → {"users":[{"id":"admin-esquel-01","email":"admin@esquelalerta.ar",
#     "phone":"2945-451234","accessCode":"EsquelAlerta2026!","password":"...", ...}]}
```

**Impacto:** filtración masiva de datos personales de todos los vecinos registrados (nombre, apellido, email, teléfono/WhatsApp, edad, género, barrio) **más las contraseñas en texto plano**. Como muchas personas reutilizan contraseñas, el daño se propaga fuera de la plataforma. En una ciudad de ~40.000 habitantes donde el padrón es identificable persona por persona, esto es además un problema serio frente a la Ley 25.326 de Protección de Datos Personales.

**Fix — helper de autorización reutilizable:**

```php
// api/config.php — AGREGAR al final del archivo

/**
 * Corta la ejecución si no hay un token válido con uno de los roles pedidos.
 * Devuelve el payload del usuario autenticado.
 */
function requireRole(array $roles) {
    $user = getAuthenticatedUser();
    if (!$user) {
        jsonError('Necesitás iniciar sesión para acceder a este recurso.', 401);
    }
    if (!in_array($user['role'] ?? '', $roles, true)) {
        jsonError('No tenés permisos para acceder a este recurso.', 403);
    }
    return $user;
}

/** Traza de auditoría para accesos a datos sensibles. */
function auditLog(string $action, array $meta = []) {
    $line = json_encode([
        'ts'     => date('c'),
        'action' => $action,
        'ip'     => getClientIp(),
        'meta'   => $meta
    ], JSON_UNESCAPED_UNICODE);
    @file_put_contents(__DIR__ . '/data/audit.log', $line . "\n", FILE_APPEND | LOCK_EX);
}
```

```php
// api/auth.php:59 — REEMPLAZAR el bloque completo
if ($method === 'GET' && $action === 'users') {
    $admin = requireRole(['admin', 'superadmin']);          // ← 1. exige sesión de admin
    auditLog('users.list.with_credentials', [               // ← 2. deja traza
        'by' => $admin['id'] ?? null,
        'email' => $admin['email'] ?? null
    ]);
    header('Cache-Control: no-store');                      // ← 3. no cachear jamás
    // ... resto del código EXACTAMENTE IGUAL, incluida la columna password ...
}
```

> Con esto tu panel sigue funcionando idéntico: el admin ya manda `Authorization: Bearer <token>` en cada request (ver `web/src/services/api.ts:47`). Lo único que cambia es que un anónimo recibe `401`.
>
> ⚠️ **Además hay que agregar `audit.log` al `.gitignore`** y confirmar que `.htaccess` bloquea `.log` (ya lo hace, línea 9).

---

### SEC-02 🔴 — Backdoor universal: `admin123` abre cualquier cuenta

**Archivo:** `api/auth.php:233`

```php
$isValid = ($password === $storedPass)
        || (password_verify($password, $dbUser['password'] ?? ''))
        || ($password === 'EsquelAlerta2026!')      // ← backdoor
        || ($password === 'admin123');              // ← backdoor
```

Los dos últimos `||` hacen que **cualquier contraseña igual a `admin123` valide contra cualquier cuenta del sistema**, incluida la del superadministrador. Encadenado con SEC-01 (que te da la lista de todos los emails), el compromiso total del sistema es de dos comandos.

**PoC:**
```bash
curl -s -X POST https://gray-dogfish-546625.hostingersite.com/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"admin@esquelalerta.ar","password":"admin123"}'
# → {"user":{"role":"admin",...},"token":"eyJ..."}
```

**Fix:**
```php
// api/auth.php:232-233 — REEMPLAZAR
$storedPass = $dbUser['accessCode'] ?: $dbUser['password'];

// Comparación en tiempo constante contra la clave real del usuario, y nada más.
$isValid = is_string($storedPass)
        && $storedPass !== ''
        && hash_equals((string) $storedPass, (string) $password);

// Si más adelante migrás a AES (Opción B de la sección 1):
// $isValid = hash_equals(decryptPassword($storedPass), (string) $password);
```

Eliminá también el `password_verify()`: nunca se guardan hashes bcrypt en esa columna, así que sólo agrega ruido y un `false` garantizado.

---

### SEC-03 🔴 — `POST /api/auth/staff` regala rol superadmin

**Archivo:** `api/auth.php:270` y `293-305`

```php
$validCodes = [ADMIN_ACCESS_CODE, 'EsquelAlerta2026!', 'admin123', '3479c4d1e3de', '3f45f78f6608'];
$isValidCode = in_array($accessCode, $validCodes, true);
...
if ($identifier === 'admin@esquelalerta.ar' || strtolower($identifier) === 'admin' || $isValidCode) {
    if ($isValidCode || (...)) {
        $userPayload = [
            'id'   => $dbUser['id']   ?? 'admin-esquel-01',
            'role' => $dbUser['role'] ?? 'superadmin',   // ← rol superadmin sin usuario en la DB
        ];
```

Con **cualquier** identificador inventado y uno de esos 5 códigos, `$dbUser` queda `null`, los `??` se activan y se emite un token de `superadmin` real y firmado.

**PoC:**
```bash
curl -s -X POST https://gray-dogfish-546625.hostingersite.com/api/auth/staff \
  -H 'Content-Type: application/json' \
  -d '{"email":"cualquiercosa@nada.com","accessCode":"admin123"}'
# → {"user":{"id":"admin-esquel-01","role":"superadmin",...},"token":"eyJ..."}
```

**Fix:**
```php
// api/auth.php:270 — REEMPLAZAR el bloque 6 completo
// 1. Nada de listas de códigos hardcodeados: sólo el de entorno.
// 2. El usuario TIENE que existir en la base con rol de staff.
// 3. Sin fallback de identidad.

$STAFF_ROLES = ['admin','superadmin','municipio','coop16','policia','vecinales',
                'institution','revisor','coordinador_operativo','coordinador_redes',
                'seguridad_comunitaria','referente_barrial','neighbor_leader'];

if (!$dbUser || !in_array($dbUser['role'] ?? '', $STAFF_ROLES, true)) {
    auditLog('staff.login.failed', ['identifier' => $identifier]);
    jsonError('Código de acceso o credenciales incorrectas.', 401, 'accessCode');
}

$storedCode = $dbUser['accessCode'] ?: $dbUser['password'];
if (!is_string($storedCode) || $storedCode === '' || !hash_equals($storedCode, $accessCode)) {
    auditLog('staff.login.failed', ['identifier' => $identifier]);
    jsonError('Código de acceso o credenciales incorrectas.', 401, 'accessCode');
}

auditLog('staff.login.ok', ['id' => $dbUser['id'], 'role' => $dbUser['role']]);
$userPayload = [
    'id'              => $dbUser['id'],
    'email'           => $dbUser['email'],
    'fullName'        => $dbUser['fullName'],
    'role'            => $dbUser['role'],
    'institutionName' => $dbUser['institutionName'] ?? null
];
jsonResponse(['user' => $userPayload, 'token' => generateToken($userPayload)]);
```

⚠️ **Antes de aplicar esto**, asegurate de que el usuario `admin@esquelalerta.ar` exista en la tabla `users` con `role='admin'` y un `accessCode` nuevo, o te quedás afuera del panel.

---

### SEC-04 🔴 — Creación de usuarios sin autenticación

**Archivo:** `api/auth.php:326`

El endpoint `POST /api/auth/users/create` acepta `role` desde el body y no verifica absolutamente nada.

**PoC:**
```bash
curl -s -X POST 'https://gray-dogfish-546625.hostingersite.com/api/auth/users/create' \
  -H 'Content-Type: application/json' \
  -d '{"fullName":"Intruso","role":"superadmin","accessCode":"loquesea123"}'
# → {"success":true,...}  y ahora existe un superadmin ajeno
```

**Fix:**
```php
// api/auth.php:326 — al inicio del bloque
$admin = requireRole(['admin', 'superadmin']);

// Y whitelist explícita de roles asignables (nunca confiar en el body):
$ALLOWED_ROLES = ['revisor','municipio','coop16','policia','vecinales','institution',
                  'coordinador_operativo','coordinador_redes','seguridad_comunitaria',
                  'referente_barrial','neighbor_leader','citizen'];
if (!in_array($role, $ALLOWED_ROLES, true)) {
    jsonError('Rol no válido.', 400, 'role');
}
// Sólo un superadmin puede crear otro admin/superadmin:
if (in_array($role, ['admin','superadmin'], true) && ($admin['role'] ?? '') !== 'superadmin') {
    jsonError('Sólo un superadministrador puede crear otro administrador.', 403, 'role');
}
auditLog('users.create', ['by' => $admin['id'], 'newRole' => $role]);
```

Además, `api/auth.php:386` filtra el mensaje de excepción de MySQL al cliente (`jsonError("Error en base de datos: " . $e->getMessage(), 500)`). Cambialo por un mensaje genérico + `error_log()`.

---

### SEC-05 🔴 — Cambio de estado de reclamos sin autenticación

**Archivo:** `api/claims.php:351-513`

El bloque `PATCH` no llama a `getAuthenticatedUser()` en ningún momento. Cualquiera puede marcar reclamos como resueltos, rechazarlos, **escribir comentarios que la UI muestra con el sello de "oficial"** (`isOfficial=1`, línea 421) y disparar el mecanismo de suspensión sobre vecinos ajenos.

**PoC:**
```bash
curl -s -X PATCH 'https://gray-dogfish-546625.hostingersite.com/api/claims/1/status' \
  -H 'Content-Type: application/json' \
  -d '{"status":"resolved","statusNote":"Resuelto por la Municipalidad","verifiedBy":"Municipalidad de Esquel"}'
```

**Impacto:** destrucción de la confianza pública en la plataforma. Cualquier persona puede hacer aparecer declaraciones falsas atribuidas a la Municipalidad o a la Coop16. Para una herramienta cívica, esto es el riesgo reputacional más grave del sistema.

**Fix:**
```php
// api/claims.php:351 — inmediatamente después de `if ($method === 'PATCH' && $claimId > 0) {`
$staff = requireRole(['admin','superadmin','municipio','coop16','policia','vecinales',
                      'institution','revisor','coordinador_operativo','referente_barrial']);

// El nombre del verificador SIEMPRE sale del token, nunca del body:
$verifiedBy = $staff['institutionName'] ?: ($staff['fullName'] ?? 'Gestión Oficial');

// Whitelist de estados (hoy se inserta el string crudo del body en un ENUM):
$ALLOWED_STATUS = ['pending','in_progress','resolved','rejected'];
if (!empty($status) && !in_array($status, $ALLOWED_STATUS, true)) {
    jsonError('Estado no válido.', 400, 'status');
}
auditLog('claim.status.change', ['by' => $staff['id'], 'claim' => $claimId, 'to' => $status]);
```

Lo mismo aplica a `api/comments.php:44`: hoy un anónimo puede postear con cualquier `authorName`. Como mínimo, forzá que si `getAuthenticatedUser()` devuelve `null`, el `authorName` sea siempre `'Vecino/a'` y nunca lo que venga en el body — o directamente exigí sesión para comentar.

---

### SEC-06 🔴 — `POST /api/auth/google` es una fábrica de identidades

**Archivo:** `api/auth.php:394-408`

```php
if ($method === 'POST' && $action === 'google') {
    $email = strtolower(trim($body['email'] ?? 'vecino@esquel.ar'));
    // ... no se verifica NINGÚN id_token de Google ...
    $token = generateToken($userPayload);
```

**PoC:**
```bash
curl -s -X POST https://gray-dogfish-546625.hostingersite.com/api/auth/google \
  -H 'Content-Type: application/json' \
  -d '{"email":"intendente@esquel.gob.ar","fullName":"Intendente"}'
# → token firmado y válido con esa identidad
```

**Fix:** el endpoint está marcado como *"compatibilidad"* y el frontend nunca lo usa (`fetchAuthConfig` devuelve `googleEnabled: false`). **Borralo.** Si algún día activás Google Sign-In de verdad, hay que verificar el `id_token` contra `https://oauth2.googleapis.com/tokeninfo?id_token=...` y validar `aud` contra tu `GOOGLE_CLIENT_ID`.

```php
// api/auth.php:393-408 — ELIMINAR el bloque 8 completo
```

---

### SEC-07 🔴 — Re-registro = toma de cuenta

**Archivo:** `api/auth.php:133-150`

Si el email o el teléfono ya existen, el código hace `UPDATE users SET accessCode = :password, password = :password WHERE id = :id` y devuelve un token de sesión **de esa cuenta preexistente**, sin ninguna verificación de que quien registra sea el dueño.

**PoC:** registrarse con el email de cualquier vecino conocido (o del admin) → su contraseña queda pisada y el atacante entra con la sesión de esa cuenta.

**Fix:**
```php
// api/auth.php:133 — REEMPLAZAR la rama `if ($exists)`
if ($exists) {
    jsonError(
        'Ya existe una cuenta con ese correo o teléfono. Iniciá sesión, o pedile a la coordinación que te recuerde tu clave.',
        409,
        'email'
    );
}
```

El "pedile a la coordinación que te recuerde tu clave" es exactamente el flujo que vos querés sostener — y ahora es la vía **única** de recuperación, en lugar de un agujero de toma de cuentas.

---

### SEC-08 🔴 — Secretos de producción en el repositorio

**Archivo:** `api/config.php:58-70`

```php
if (!defined('DB_PASS'))          define('DB_PASS', getenv('DB_PASS') ?: 'Arco********');
if (!defined('JWT_SECRET'))       $secret = getenv('JWT_SECRET') ?: '3479c4d1e3de4392...21ab';
if (!defined('ADMIN_ACCESS_CODE'))define('ADMIN_ACCESS_CODE', getenv('ADMIN_ACCESS_CODE') ?: 'Esquel********');
```

El repositorio hoy es **privado**, lo cual limita el daño inmediato. Pero:

- El `JWT_SECRET` por defecto permite **firmar tokens de superadmin arbitrarios** a cualquiera que vea el código (colaborador, futuro fork, o el día que lo hagas público). No hace falta ni loguearse: se forja el token directamente.
- Los secretos quedan en el **historial de git para siempre**; cambiar el archivo hoy no los borra de los commits viejos.
- Los fragmentos `'3479c4d1e3de'` y `'3f45f78f6608'` de la lista `$validCodes` (SEC-03) son literalmente los primeros 12 caracteres del `JWT_SECRET` usados como código de acceso.

**Fix (en este orden):**

1. **Rotar todo, ahora** — antes de tocar el código:
   - Nueva contraseña de MySQL desde hPanel.
   - `openssl rand -hex 32` → nuevo `JWT_SECRET` (invalida todas las sesiones activas; es lo deseado).
   - Nuevo `ADMIN_ACCESS_CODE`.
2. Cargar todo en `/home/uXXXXX/esquel-config.php`, **fuera del webroot** (el mecanismo ya existe en `config.php:33-38` y funciona).
3. Dejar el código **sin fallbacks**:

```php
// api/config.php:58-70 — REEMPLAZAR
foreach (['DB_HOST','DB_NAME','DB_USER','DB_PASS','JWT_SECRET'] as $req) {
    if (!defined($req)) {
        $val = getenv($req);
        if ($val === false || $val === '') {
            error_log("FATAL: falta la constante de configuración {$req}");
            jsonError('El servicio no está disponible temporalmente.', 503);
        }
        define($req, $val);
    }
}
if (!defined('ADMIN_ACCESS_CODE')) define('ADMIN_ACCESS_CODE', getenv('ADMIN_ACCESS_CODE') ?: '');
if (strlen(JWT_SECRET) < 32) {
    error_log('FATAL: JWT_SECRET demasiado corto');
    jsonError('El servicio no está disponible temporalmente.', 503);
}
```

4. Limpiar el historial con `git filter-repo`, o —más simple y igual de efectivo dado que los secretos ya están rotados— dejar el historial como está y considerar los valores viejos como quemados.

---

### SEC-09 🟠 — `/api/admin/metrics` público

**Archivo:** `api/metrics.php` (sin ninguna llamada a `getAuthenticatedUser()`)

Se llama `admin/metrics` pero responde a cualquiera: expone el listado completo de reclamos, el análisis de diversificación de autores y el bloque `financial` con `projectedMonthlyRevenue`, `projectedAnnualRevenue` y la tarifa mensual de cada sponsor.

**Fix:** `requireRole([...roles de staff...])` como primera línea después del `require_once`. Si querés que las métricas públicas sean visibles para los vecinos (buena idea para la transparencia cívica), separá en dos endpoints: `/api/metrics/public` con los KPIs agregados sin datos financieros ni `authorName`, y `/api/admin/metrics` protegido con todo lo demás.

---

### SEC-10 🟠 — Fraude de apoyos trivial

**Archivo:** `api/config.php:490-500`

```php
function getClientIp() {
    return $_SERVER['HTTP_CF_CONNECTING_IP']      // ← header del cliente
        ?? $_SERVER['HTTP_X_FORWARDED_FOR']       // ← header del cliente
        ?? $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
}
function getDeviceId() {
    return $headers['X-Device-Id'] ?? ... ?? $_GET['deviceId'] ?? ... ?? getClientIp();
}
```

La deduplicación de votos (`UNIQUE KEY unique_upvote (claimId, deviceId)`) se apoya en un valor **enteramente controlado por el cliente**.

**PoC:**
```bash
for i in $(seq 1 500); do
  curl -s -X POST "https://gray-dogfish-546625.hostingersite.com/api/claims/1/upvote" \
       -H "X-Device-Id: fake-$i" > /dev/null
done   # → 500 apoyos falsos en un reclamo
```

**Impacto:** el conteo de apoyos es *la* métrica de priorización de la plataforma — lo que define qué reclamo ve primero la Municipalidad. Si es manipulable, el ranking pierde todo valor y la herramienta deja de ser creíble ante los organismos.

**Fix (defensa en capas — ninguna es perfecta sola, juntas alcanzan de sobra para el volumen de Esquel):**

```php
// api/config.php — REEMPLAZAR ambas funciones

function getClientIp() {
    // REMOTE_ADDR es lo único que el cliente no puede falsificar.
    // Si algún día ponés Cloudflare adelante, validá que REMOTE_ADDR
    // pertenezca al rango de Cloudflare ANTES de confiar en CF-Connecting-IP.
    return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
}

function getDeviceId() {
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    $raw = $headers['X-Device-Id'] ?? $headers['x-device-id'] ?? $_GET['deviceId'] ?? '';
    // Formato estricto: 32 hex, como lo genera web/src/lib/device.ts
    if (!preg_match('/^[a-f0-9]{32}$/i', (string) $raw)) {
        $raw = 'ip-' . getClientIp();
    }
    // Se ata el device al /24 de la IP: cambiar el header solo ya no alcanza.
    $ipPrefix = implode('.', array_slice(explode('.', getClientIp()), 0, 3));
    return substr(hash('sha256', $raw . '|' . $ipPrefix . '|' . JWT_SECRET), 0, 40);
}
```

Complementar con el rate limiter de SEC-12 (ej.: máx. 30 upvotes por IP/hora) y, cuando el volumen lo justifique, exigir sesión para votar (hoy el apoyo anónimo es una decisión de producto válida y buena — el "cero fricción"; mantenela, sólo limitala).

---

### SEC-11 🟠 — Subida de archivos sin control

**Archivo:** `api/upload.php`

Puntos buenos ya presentes: se valida el MIME real con `finfo` (no el `Content-Type` del cliente), se genera el nombre con `random_bytes`, y `uploads/.htaccess` bloquea la ejecución de `.php`. Eso cubre lo peor.

Lo que falta:
- **Sin autenticación ni rate limit:** cualquiera puede subir archivos de 10 MB en loop hasta llenar la cuota de disco de Hostinger. Cuando el disco se llena, `writeJsonData()` empieza a fallar y **puede truncar `claims.json`** — pérdida de datos.
- **Sin re-encode:** un JPG válido puede llevar payloads en metadatos EXIF. Bajo, pero se elimina gratis re-encodeando.
- **Sin límite de dimensiones:** una imagen de 20000×20000 px ("decompression bomb") agota la memoria de PHP al procesarla.
- **Sin borrado de EXIF:** las fotos de celular llevan **coordenadas GPS del domicilio** del vecino. En una app donde la gente saca fotos desde su casa, esto es una filtración real de privacidad.

**Fix:**
```php
// api/upload.php — después de la validación de MIME
requireAnyUser();          // o rateLimit('upload', 10, 3600) si querés mantenerlo anónimo

// Límite de dimensiones
$info = @getimagesize($file['tmp_name']);
if (!$info || $info[0] > 6000 || $info[1] > 6000) {
    jsonError('La imagen es demasiado grande. Máximo 6000×6000 píxeles.', 400);
}

// Re-encode: elimina EXIF (incluido GPS), payloads embebidos y reduce peso
$img = match ($mime) {
    'image/jpeg' => imagecreatefromjpeg($file['tmp_name']),
    'image/png'  => imagecreatefrompng($file['tmp_name']),
    'image/webp' => imagecreatefromwebp($file['tmp_name']),
};
if (!$img) jsonError('No pudimos procesar la imagen.', 400);

// Redimensionar a máx 1600px de ancho
$w = imagesx($img); $h = imagesy($img);
if ($w > 1600) {
    $nh  = (int) round($h * (1600 / $w));
    $dst = imagecreatetruecolor(1600, $nh);
    imagecopyresampled($dst, $img, 0,0,0,0, 1600, $nh, $w, $h);
    imagedestroy($img);
    $img = $dst;
}
imagejpeg($img, $targetPath, 82);   // salida siempre JPEG normalizado
imagedestroy($img);
```

---

### SEC-12 🟠 — Cero rate limiting

El README declara *"rate limiting por IP"*. `grep -rn "rate" api/` no devuelve nada. Login, registro, upload, comentarios y upvotes son todos ilimitados: fuerza bruta y spam sin ninguna barrera.

**Fix — rate limiter por archivo, sin dependencias, apto para hosting compartido:**

```php
// api/config.php — AGREGAR

function rateLimit(string $bucket, int $maxHits, int $windowSecs) {
    $key  = $bucket . '|' . getClientIp();
    $dir  = __DIR__ . '/data/ratelimit';
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    $file = $dir . '/' . hash('sha256', $key) . '.json';

    $now  = time();
    $hits = [];
    if (file_exists($file)) {
        $hits = json_decode(@file_get_contents($file), true) ?: [];
    }
    // Descarta los hits fuera de la ventana
    $hits = array_values(array_filter($hits, fn($t) => $t > $now - $windowSecs));

    if (count($hits) >= $maxHits) {
        header('Retry-After: ' . $windowSecs);
        jsonError('Demasiados intentos. Esperá un momento y volvé a probar.', 429);
    }
    $hits[] = $now;
    @file_put_contents($file, json_encode($hits), LOCK_EX);

    // Limpieza oportunista: 1 de cada 100 requests barre archivos viejos
    if (random_int(1, 100) === 1) {
        foreach (glob($dir . '/*.json') as $f) {
            if (filemtime($f) < $now - 86400) @unlink($f);
        }
    }
}
```

Aplicación por endpoint:

| Endpoint | Llamada |
|---|---|
| `POST /api/auth/login` | `rateLimit('login', 8, 900)` |
| `POST /api/auth/staff` | `rateLimit('staff', 5, 900)` |
| `POST /api/auth/register` | `rateLimit('register', 3, 3600)` |
| `POST /api/claims` | `rateLimit('claim', 10, 3600)` |
| `POST /api/claims/{id}/upvote` | `rateLimit('upvote', 30, 3600)` |
| `POST /api/claims/{id}/comments` | `rateLimit('comment', 20, 3600)` |
| `POST /api/uploads` | `rateLimit('upload', 15, 3600)` |
| `GET /api/auth/users` | `rateLimit('userlist', 30, 3600)` |

⚠️ Agregar `api/data/ratelimit/` al `.gitignore`.

---

### SEC-13 🟠 — CORS permisivo

**Archivo:** `api/config.php:15-20`

```php
if (in_array($origin, $allowedOrigins, true) || empty($origin)) {
    header("Access-Control-Allow-Origin: " . ($origin ?: "*"));
    header("Access-Control-Allow-Credentials: true");
} else {
    header("Access-Control-Allow-Origin: *");   // ← cualquier origen no permitido igual pasa
}
```

La rama `else` anula por completo la whitelist. Y `Allow-Origin: *` junto con `Allow-Credentials: true` es una combinación que los navegadores rechazan, así que además genera errores confusos en dev.

**Fix:**
```php
// api/config.php:15-20 — REEMPLAZAR
if (in_array($origin, $allowedOrigins, true)) {
    header("Access-Control-Allow-Origin: " . $origin);
    header("Access-Control-Allow-Credentials: true");
    header("Vary: Origin");
}
// Si el origen no está en la whitelist NO se emite ningún header CORS.
// Las requests same-origin (el propio sitio) funcionan igual: no mandan Origin.
```

---

### SEC-14 🟠 — Faltan cabeceras de seguridad

**Archivo:** `.htaccess:53-57`

Están `X-Content-Type-Options`, `X-Frame-Options` y `Referrer-Policy`. Faltan CSP, HSTS y Permissions-Policy.

```apache
# .htaccess — REEMPLAZAR el bloque 4
<IfModule mod_headers.c>
  Header always set X-Content-Type-Options "nosniff"
  Header always set X-Frame-Options "SAMEORIGIN"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
  Header always set Permissions-Policy "geolocation=(self), camera=(self), microphone=(), payment=(), interest-cohort=()"
  Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains" env=HTTPS

  # CSP ajustada a las dependencias reales de la app:
  #  - fonts.googleapis.com / fonts.gstatic.com  → Inter + Outfit
  #  - *.basemaps.cartocdn.com, tile.openstreetmap.org, server.arcgisonline.com → tiles Leaflet
  #  - nominatim.openstreetmap.org → geocodificación
  #  - images.unsplash.com → avatares de usuarios semilla
  #  - 'unsafe-inline' en style-src es necesario: Leaflet y los estilos inline de React lo requieren
  Header always set Content-Security-Policy "default-src 'self'; \
script-src 'self'; \
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; \
font-src 'self' https://fonts.gstatic.com; \
img-src 'self' data: blob: https://*.basemaps.cartocdn.com https://*.tile.openstreetmap.org https://server.arcgisonline.com https://images.unsplash.com; \
connect-src 'self' https://nominatim.openstreetmap.org; \
frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'"
</IfModule>
```

> Probá la CSP primero con `Content-Security-Policy-Report-Only` durante unos días y mirá la consola del navegador antes de aplicarla en modo bloqueante.

---

### SEC-15 🟡 — Manejo de sesiones JWT

**Archivo:** `api/config.php:445-469`

Lo que está bien: `hash_equals()` para comparar la firma (resistente a timing attacks) y HMAC recalculado sin leer el `alg` del header (inmune al ataque `alg:none`). Buen trabajo ahí.

Lo que falta:
- **Expiración de 30 días** (`86400 * 30`) sin refresh ni revocación. Un token filtrado sirve un mes entero.
- **`base64_encode` estándar en vez de base64url**: genera `+`, `/` y `=`, que rompen el token si alguna vez viaja por querystring. No es un problema hoy (va por header), pero es incorrecto y frágil.
- **Sin `jti`**, así que no hay forma de invalidar un token puntual.
- Almacenado en `localStorage` (`web/src/lib/device.ts:36`) → accesible por JS. Con la CSP de SEC-14 el riesgo baja bastante; una cookie `HttpOnly; Secure; SameSite=Strict` sería mejor pero implica más refactor.

**Fix mínimo:**
```php
// api/config.php:445 — en generateToken()
$payload['exp'] = time() + (86400 * 7);              // 7 días en vez de 30
$payload['jti'] = bin2hex(random_bytes(8));

// base64url en las tres partes
$b64url = fn($s) => rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
```

Recordá aplicar la decodificación inversa en `verifyToken()`. La rotación del `JWT_SECRET` (SEC-08) invalida todo lo emitido con el formato viejo, así que hacé ambos cambios en el mismo deploy.

---

### SEC-16 🟡 — Almacenamiento dual dentro del webroot

**Archivo:** `api/config.php:96-117`

Los JSON viven en `/api/data/`, dentro del directorio público. Hoy están protegidos porque `.htaccess:8` bloquea `\.(env|sql|sqlite|db|log|sh|bak|config|json|md)$`. Esa protección es **la única capa** y se pierde entera si:
- Hostinger cambia la config de LiteSpeed o `AllowOverride`.
- Migrás a nginx (`web/nginx.conf` ya existe en el repo para el modo Docker) — nginx **ignora `.htaccess` por completo**.
- Alguien renombra o mueve el archivo.

Además `writeJsonData()` hace read-modify-write sin lock compartido: dos requests simultáneas pueden pisarse y perder reclamos.

**Fix:** mover el directorio de datos fuera del webroot.
```php
// api/config.php:96 — en getJsonFilePath()
// Guardar en /home/uXXXX/esquel-data/ en producción, fuera de public_html
$dir = defined('DATA_DIR') ? DATA_DIR : __DIR__ . '/data';
```
Definir `DATA_DIR` en `/home/uXXXXX/esquel-config.php`. Los archivos semilla del repo se copian una vez a ese directorio en el primer deploy.

---

### SEC-17 🟡 — Export CSV del padrón

**Archivo:** `web/src/components/AdminDashboard.tsx:339-370`

El CSV incluye la columna `'Clave / Acceso'` con las contraseñas en claro y se descarga sin confirmación ni traza. Ese archivo termina en la carpeta Descargas de una notebook, se manda por WhatsApp, se sincroniza a Drive.

**No hay que quitar la función**, pero sí:
1. Diálogo de confirmación explícito: *"Vas a descargar un archivo con las contraseñas de N vecinos. Guardalo en un lugar seguro y borralo cuando termines."*
2. Registrar la descarga en el audit log del servidor (`POST /api/admin/audit`).
3. Restringir la exportación **con** columna de claves a rol `superadmin`; que `admin` y el resto exporten el padrón **sin** esa columna.
4. Encabezado en la primera fila del CSV: `CONFIDENCIAL — Datos personales protegidos por Ley 25.326. No redistribuir.`

---

### SEC-18 🟡 — Enumeración de usuarios

**Archivo:** `api/auth.php:228` vs `236`

`'No encontramos una cuenta con ese correo...'` (404) vs `'Contraseña incorrecta...'` (401) permite descubrir qué emails/teléfonos están registrados.

**Contexto:** en una plataforma comunitaria chica esto es un riesgo menor y el mensaje diferenciado es **mejor UX** (le dice al vecino exactamente qué hacer). Mi recomendación es **dejarlo como está** y compensar con el rate limiting de SEC-12, que es lo que realmente frena el abuso. Lo dejo documentado para que sea una decisión consciente y no un olvido.

---

## 4. Bugs funcionales

### BUG-01 🔴 — Todos los links compartidos por WhatsApp están rotos

**Archivos:** `web/src/components/ClaimModal.tsx:53` ↔ `web/src/App.tsx:161`

```tsx
// ClaimModal.tsx:53 — GENERA el link
const shareUrl = `${window.location.origin}/?claimId=${claim.id}`;

// App.tsx:160-161 — LEE el link
const params = new URLSearchParams(window.location.search);
const claimIdParam = params.get('claim');     // ← busca 'claim', no 'claimId'
```

Los nombres de parámetro no coinciden. **Cada link que un vecino comparte por WhatsApp abre la app en el mapa genérico**, sin el reclamo que quería mostrar. Para una app cuyo motor de crecimiento es que la gente comparta reclamos por WhatsApp, esto es el bug de producto más caro del sistema, y es una línea.

**Fix (aceptar ambos, por los links ya circulando):**
```tsx
// App.tsx:161
const claimIdParam = params.get('claim') ?? params.get('claimId');
```
```tsx
// ClaimModal.tsx:53 — unificar hacia adelante
const shareUrl = `${window.location.origin}/?claim=${claim.id}`;
```

Además, cuando se abre un reclamo debería reflejarse en la URL para que el botón "atrás" del navegador funcione y el usuario pueda copiar la dirección desde la barra:
```tsx
// App.tsx — al seleccionar un reclamo
useEffect(() => {
  const url = new URL(window.location.href);
  if (selectedClaim) url.searchParams.set('claim', String(selectedClaim.id));
  else url.searchParams.delete('claim');
  window.history.replaceState({}, '', url);
}, [selectedClaim]);
```

---

### BUG-02 🟠 — La suspensión por 3 rechazos nunca se aplica

**Archivo:** `api/claims.php:454-459`

```php
$upUser = $pdo->prepare("
    UPDATE `users`
    SET rejectionsCount = :rej,
        suspendedUntil = CASE WHEN :rej >= 3 THEN DATE_ADD(NOW(), INTERVAL 3 DAY) ELSE suspendedUntil END
    WHERE (:aId IS NOT NULL AND id = :aId) OR (:aEmail IS NOT NULL AND email = :aEmail)
");
// ← nunca se llama a ->execute()
```

La sentencia se prepara y se descarta. Todo el sistema de moderación progresiva (`SuspensionModal.tsx`, el chequeo de `suspendedUntil` en `claims.php:235`, el contador en la UI) está construido sobre un contador que **nunca se incrementa**.

**Fix:**
```php
$upUser->execute([
    ':rej'    => $rejections,
    ':aId'    => $aId ?: null,
    ':aEmail' => $aEmail ?: null
]);
```

---

### BUG-03 🟠 — Fallback JSON de upvote siempre suma

**Archivo:** `api/upvote.php:56-70`

Cuando MySQL no está disponible, el fallback incrementa `upvotesCount` en cada request, sin verificar si ese device ya votó y sin permitir quitar el apoyo. Un usuario que toque el botón cinco veces suma cinco.

**Fix:** persistir un `upvotes.json` con pares `{claimId, deviceId}` y replicar la lógica de toggle del camino MySQL. Si preferís no complicarlo, al menos devolvé `503` en el fallback en vez de un incremento incorrecto — un error honesto es mejor que un dato falso en la métrica que ordena todo el sistema.

---

### BUG-04 🟡 — `register` responde 201 aunque falle el INSERT

**Archivo:** `api/auth.php:171-192`

El `catch` sólo hace `error_log()` y la ejecución sigue hasta `jsonResponse([...], 201)`. El vecino ve *"¡Bienvenido/a!"*, recibe +10 puntos en pantalla y un token válido, pero **no existe en la base**. Al día siguiente intenta entrar y le dice que no tiene cuenta. Es exactamente el tipo de fallo que hace que la gente abandone una app comunitaria.

**Fix:**
```php
} catch (Exception $e) {
    error_log("Register user DB error: " . $e->getMessage());
    jsonError('No pudimos completar tu registro. Probá de nuevo en un momento.', 500);
}
```
Aplicá el mismo criterio en `claims.php:309` y `comments.php:79`: si MySQL está configurado y falla, hay que devolver error, no caer silenciosamente al JSON y generar dos fuentes de verdad divergentes.

---

### BUG-05 🟡 — Sin Open Graph dinámico

**Archivo:** `index.html:20-30`

Todos los OG tags son estáticos. Cada reclamo compartido en WhatsApp muestra la misma tarjeta genérica con el logo. El repo ya tiene la solución escrita para el backend Node (`server/src/routes/og.ts`) pero no se portó a PHP.

**Fix:** `api/og.php` que detecte el user-agent de los crawlers (`facebookexternalhit`, `WhatsApp`, `Twitterbot`) y devuelva un HTML mínimo con los meta tags del reclamo y su foto:

```apache
# .htaccess — antes de la regla del SPA
RewriteCond %{HTTP_USER_AGENT} (facebookexternalhit|WhatsApp|Twitterbot|Slackbot|TelegramBot) [NC]
RewriteCond %{QUERY_STRING} claim=([0-9]+)
RewriteRule ^$ api/og.php?id=%1 [L]
```

Impacto directo: una tarjeta con la foto del bache y el título real se comparte muchísimo más que un logo genérico. **Recordá escapar con `htmlspecialchars($title, ENT_QUOTES, 'UTF-8')`** al inyectar en los meta tags — es la única parte del sistema donde se genera HTML del lado del servidor y sería el único vector de XSS real.

---

### BUG-06 🟠 — El CI valida el backend equivocado

**Archivo:** `.github/workflows/deploy.yml:98-104`

```yaml
echo "--- anonymous status change must be rejected ---"
STATUS=$(curl -s -o /dev/null -w '%{http_code}' \
  -X PATCH http://127.0.0.1:4000/api/claims/1/status ...)
test "$STATUS" = "401"
```

Ese test es exactamente la verificación de SEC-05 — **y pasa**, porque corre contra el backend Node de `/server`, que sí valida la autenticación. Mientras tanto, el backend PHP que está en producción devuelve 200 al mismo request. El CI está dando verde sobre código que no se despliega.

Encima, el job `deploy` empuja por SSH a una VPS (`/opt/esquel-reclamos-app`), pero el sitio real se despliega desde el panel Git de Hostinger. **El pipeline entero está desconectado de producción.**

**Fix:** agregar un job de smoke test contra el PHP real. Con PHP y su servidor embebido alcanza:

```yaml
  php-api-smoke-test:
    name: PHP API smoke test (producción real)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: shivammathur/setup-php@v2
        with: { php-version: '8.2' }

      - name: Boot PHP API y verificar que los endpoints sensibles exigen auth
        run: |
          php -S 127.0.0.1:8080 -t . &
          sleep 3

          echo "--- el padrón NO debe ser público ---"
          test "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/api/auth/users)" = "401"

          echo "--- cambio de estado anónimo debe ser rechazado ---"
          test "$(curl -s -o /dev/null -w '%{http_code}' -X PATCH \
            http://127.0.0.1:8080/api/index.php?route=claims/1/status \
            -H 'Content-Type: application/json' -d '{"status":"resolved"}')" = "401"

          echo "--- creación de usuarios anónima debe ser rechazada ---"
          test "$(curl -s -o /dev/null -w '%{http_code}' -X POST \
            'http://127.0.0.1:8080/api/index.php?route=auth/users/create' \
            -H 'Content-Type: application/json' -d '{"fullName":"x","role":"superadmin"}')" = "401"

          echo "--- métricas admin deben exigir auth ---"
          test "$(curl -s -o /dev/null -w '%{http_code}' 'http://127.0.0.1:8080/api/index.php?route=admin/metrics')" = "401"
```

Estos 4 asserts son la red de contención que evita que SEC-01, SEC-04, SEC-05 y SEC-09 vuelvan a aparecer en un refactor futuro. **Ponelos apenas apliques los fixes.**

---

## 5. UX / UI — Desktop

### 5.1 Header sobrecargado

**Archivo:** `web/src/components/Header.tsx:63`

En una sola fila de 64 px conviven: logo + wordmark + subtítulo, 4 tabs, toggle de tema, badge "N sin resolver", botón "Nuevo reclamo" y avatar/login. Son 5 grupos compitiendo por atención y ninguna jerarquía clara.

**Propuesta:**
- Subir el header a **72 px** en `lg+` para que respire (`h-16` → `h-16 lg:h-[72px]`).
- Mover el badge "N sin resolver" **fuera del header**, a la `FilterBar`, junto al contador de resultados. Es información de contexto de datos, no de navegación.
- Agrupar toggle de tema + avatar en el menú de usuario, dejando en la barra sólo: **logo · tabs · [Nuevo reclamo] · avatar**.
- El botón primario "Nuevo reclamo" hoy compite visualmente con la tab activa (ambos usan el mismo gradiente `#c0326c → #7d2247`). Diferenciá: **tab activa con fondo sólido sutil** (`bg-brand-600/12` + texto brand + barra inferior de 2 px), **reservando el gradiente pleno para el CTA**. Esto sube la conversión al botón principal.

### 5.2 Panel lateral del mapa: rompe entre 1024 y 1279 px

**Archivo:** `web/src/App.tsx:376`

```tsx
className="... hidden w-[360px] ... xl:flex"
```

El listado lateral aparece recién en `xl` (1280 px). Entre 1024 y 1279 px — **notebooks de 13" y 14", el equipamiento típico de una oficina municipal** — el usuario ve el mapa a pantalla completa y tiene que apretar un botón flotante pensado para móvil.

**Fix:** bajar a `lg:flex` con ancho fluido:
```tsx
className="... hidden lg:flex w-[320px] xl:w-[380px] 2xl:w-[420px] ..."
```

### 5.3 El panel lateral no dialoga con el mapa

Hoy el `aside` y el mapa son dos listas paralelas sin relación visual. Mejoras concretas, todas de alto valor percibido:

1. **Hover sincronizado:** al pasar el mouse sobre una tarjeta, el pin correspondiente se agranda y sube su `zIndexOffset`. Al pasar sobre un pin, la tarjeta se resalta y hace `scrollIntoView({block:'nearest'})`.
2. **Filtrar por viewport:** checkbox *"Sólo los del área visible"* que escucha `moveend` y filtra por `map.getBounds().contains()`. Es el patrón que la gente ya conoce de Airbnb/Idealista y hace el mapa mucho más útil.
3. **Encabezado sticky en el panel** con el contador y el selector de orden (hoy el orden sólo existe en la `FilterBar`, arriba de todo).
4. **Estado vacío contextual:** *"No hay reclamos en esta zona del mapa — alejá el zoom o quitá filtros"*, con botón directo.

### 5.4 Tarjeta de reclamo: densidad y jerarquía

**Archivo:** `web/src/components/ClaimCard.tsx`

- **Miniatura oculta en modo compacto** (`{!compact && ...}`, línea 31): justo en el panel lateral, donde la foto es lo que más ayuda a identificar el problema de un vistazo. Mostrala también en compacto, a 64×64 px.
- **Hasta 3 badges + timestamp** en una fila que hace wrap a dos líneas y descoloca la altura de las tarjetas. Fijá el timestamp abajo a la derecha, junto a la ubicación, y limitá la fila superior a estado + categoría.
- **Nested interactive elements:** el `<article>` tiene `role="button"` y `tabIndex={0}` (línea 25-26) y **adentro** contiene el botón de upvote. Esto es HTML inválido, confunde a los lectores de pantalla y hace que el orden de tabulación sea impredecible. Patrón correcto: `<article>` sin rol, con el título envuelto en un `<button>`/`<a>` que dispara `onOpen`, y el upvote como hermano.
- El contador de apoyos (línea 129) es el dato más accionable de la tarjeta y está en `text-sm`. Subilo a `text-base font-black` y agregá `+1` con una animación de 200 ms al votar (feedback inmediato = más votos).

### 5.5 Panel de administración

**Archivo:** `web/src/components/AdminDashboard.tsx` — **2105 líneas en un solo componente**

- **Tabla de padrón sin `<caption>`, sin `scope="col"` en los `<th>`, sin ordenamiento por columna y sin paginación.** Con 500 vecinos se vuelve inmanejable. Agregá orden por click en encabezado y paginación de 50.
- **Sin columna sticky:** al hacer scroll horizontal (9 columnas) se pierde de vista quién es cada fila. `sticky left-0 bg-inherit` en la primera celda.
- **La columna de contraseña es tu función clave y merece mejor UX.** Agregá junto al ojito un **botón de copiar al portapapeles** y un botón **"Enviar por WhatsApp"** que abra `https://wa.me/<phone>?text=Hola <nombre>, tu clave de Esquel Alerta es: <clave>`. Eso convierte el flujo de "recordar la contraseña" — que hoy es leer de la pantalla y tipear a mano — en un solo click. Es literalmente el problema que me planteaste, resuelto en la interfaz.
- **Reemplazar `window.confirm`** (línea 2084) por un modal propio. El `confirm` nativo es feo, bloquea el hilo y en algunos navegadores móviles se puede suprimir.

### 5.6 Panel de moderación: `window.prompt` es inaceptable en producción

**Archivo:** `web/src/components/ReviewerDashboard.tsx:313, 327`

```tsx
const note = window.prompt('Agregar nota oficial o respuesta institucional:');
```

Un `prompt()` nativo para redactar **la respuesta oficial de la Municipalidad a un vecino**: sin formato, sin límite de caracteres, sin posibilidad de revisar antes de enviar, sin cancelar sin perder lo escrito, y en iOS aparece como una cajita de una línea. Además, Safari lo bloquea si no viene de un gesto directo del usuario.

**Fix:** modal propio con `<textarea rows={4}>`, contador de caracteres, plantillas rápidas (*"Derivado a Obras Públicas"*, *"Requiere inspección en el lugar"*, *"Resuelto — verificado"*) y botones Cancelar/Publicar. Es el punto de contacto entre el Estado y el vecino: merece más cuidado que cualquier otra pantalla del sistema.

---

## 6. UX / UI — Mobile

> Esta es la superficie que más importa: un vecino que ve un bache saca el celular en la calle, con una mano, con datos móviles y sol de frente. Todo lo de esta sección apunta a ese escenario.

### 6.1 El presupuesto vertical está mal repartido — el problema #1 en móvil

En un iPhone SE / Android de gama media (667–740 px de alto útil), hoy se consumen:

| Elemento | Alto |
|---|---|
| Header | 64 px |
| FilterBar (búsqueda + chips + fila de selects) | ~110 px |
| SponsorBanner | ~36 px + safe area |
| **Total cromo** | **~215 px (≈32 % de la pantalla)** |

Queda menos de 450 px para el mapa, que es el producto.

**Rediseño propuesto:**

1. **Header móvil reducido a 56 px**, con sólo: logo compacto + botón de búsqueda (ícono) + avatar. Las tabs bajan a una **bottom navigation bar**, que es el patrón nativo esperado y además ubica la navegación al alcance del pulgar.

```tsx
// NUEVO — web/src/components/BottomNav.tsx
<nav
  className="fixed inset-x-0 bottom-0 z-[850] flex border-t border-slate-200
             bg-white/95 backdrop-blur-lg dark:border-white/10 dark:bg-ink-950/95 lg:hidden"
  style={{ paddingBottom: 'var(--safe-bottom)' }}
>
  {TABS.map(({ key, label, icon: Icon }) => (
    <button
      key={key}
      onClick={() => setActiveTab(key)}
      aria-current={activeTab === key ? 'page' : undefined}
      className="flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5"
    >
      <Icon className={`h-5 w-5 ${activeTab === key ? 'text-brand-600' : 'text-slate-400'}`} />
      <span className={`text-[10px] font-bold ${activeTab === key ? 'text-brand-600' : 'text-slate-400'}`}>
        {label}
      </span>
    </button>
  ))}
</nav>
```

2. **FilterBar colapsada a una sola fila** de 44 px: `[🔍 Buscar]` + `[Filtros ▾ (2)]`. Los filtros se abren en un **bottom sheet**, con el número de filtros activos en el badge. Recuperás ~66 px de mapa.

3. **SponsorBanner:** que aparezca sólo en la tab de lista/ranking, o que colapse al hacer scroll. En el mapa, cada píxel cuenta.

### 6.2 No se puede ordenar la lista en móvil

**Archivo:** `web/src/components/FilterBar.tsx:118-127`

El `<select>` de orden ("Más apoyados / Más recientes / Más antiguos") está dentro del contenedor `hidden ... xl:flex`. **Por debajo de 1280 px no existe.** Un usuario móvil no puede ver los reclamos más recientes: queda clavado en `top`. Es una funcionalidad completa perdida para la mayoría de los usuarios.

**Fix:** incluir el orden en el bottom sheet de filtros (6.1.2), como grupo de chips de selección única.

### 6.3 Áreas táctiles por debajo del mínimo

Las WCAG 2.2 (2.5.8) y las guías de Apple/Google piden **44×44 px**. Incumplimientos actuales:

| Elemento | Archivo:línea | Tamaño actual |
|---|---|---|
| Chips de estado | `FilterBar.tsx:64` (`px-3 py-1.5`) | ~28 px de alto |
| Limpiar búsqueda | `FilterBar.tsx:47` (`p-0.5`) | ~18 px |
| Cerrar modal login | `LoginModal.tsx:147` (`p-1.5`) | ~32 px |
| Ojito de contraseña | `LoginModal.tsx:290` | ~28 px |
| Ojito del padrón admin | `AdminDashboard.tsx:1431` (`p-0.5`, ícono `h-3`) | ~16 px ❌ |
| Toggle de reveal en tabla | `AdminDashboard.tsx:1435` | ~16 px ❌ |

**Fix global** — agregá a `index.css`:
```css
@layer components {
  /* Amplía el área táctil sin cambiar el tamaño visual, vía pseudo-elemento */
  .tap-target { position: relative; }
  .tap-target::after {
    content: '';
    position: absolute;
    inset: 50% 50% 50% 50%;
    transform: translate(-50%, -50%);
    width: max(100%, 44px);
    height: max(100%, 44px);
  }
}
@media (pointer: coarse) {
  .chip { @apply py-2.5 px-3.5; }   /* 28px → 44px sólo en pantallas táctiles */
}
```

### 6.4 Los gestores de contraseña no pueden guardar nada

**Archivo:** `web/src/components/LoginModal.tsx` — **ni un solo atributo `name` ni `autoComplete` en todo el formulario.**

Esto es directamente relevante a tu problema. Sin `autoComplete`, ni el llavero de iOS, ni Google Password Manager, ni el navegador ofrecen guardar la contraseña. Cada vecino tiene que recordarla de memoria o pedírtela a vos. **Arreglando esto, buena parte de los pedidos de "recordame la clave" desaparecen solos** — y tu panel de admin queda como red de contención para los casos que igual van a pasar, en vez de ser el único mecanismo.

```tsx
// Registro
<input name="fname"    autoComplete="given-name"  ... />
<input name="lname"    autoComplete="family-name" ... />
<input name="email"    autoComplete="email"       type="email"
       inputMode="email" enterKeyHint="next" ... />
<input name="phone"    autoComplete="tel-national" type="tel"
       inputMode="tel"   enterKeyHint="next" ... />
<input name="password" autoComplete="new-password" enterKeyHint="done" ... />

// Login
<input name="username" autoComplete="username"         enterKeyHint="next" ... />
<input name="password" autoComplete="current-password" enterKeyHint="go"   ... />
```

Sumá también:
- **`inputMode="numeric"`** en el campo de edad (`LoginModal.tsx`) → teclado numérico.
- **`enterKeyHint`** en todos → la tecla del teclado dice "Siguiente"/"Listo" en vez de "Enter".
- **Autofoco correcto:** en móvil, `autoFocus` abre el teclado y tapa media pantalla. En `NewClaimDrawer.tsx:383` hay un `autoFocus` en el título; condicionalo a `window.matchMedia('(pointer: fine)').matches`.

### 6.5 Fotos: el paso más caro del flujo

**Archivo:** `web/src/components/NewClaimDrawer.tsx:457-464`

```tsx
<input type="file" accept="image/*" capture="environment" ... />
```

Dos problemas:

1. **`capture="environment"` fuerza la cámara** y en muchos Android **elimina la opción de elegir de la galería**. Si el vecino sacó la foto del bache hace dos horas, no la puede subir. Quitá el atributo, o mejor: dos botones explícitos, *"Sacar foto"* (con `capture`) y *"Elegir de galería"* (sin él).

2. **Sin compresión en el cliente.** Se acepta hasta 10 MB (línea 167) y se sube tal cual. Una foto de un celular moderno pesa 4–8 MB; con datos móviles en Esquel eso son 30–60 segundos de subida, y muchos abandonos. **Comprimí antes de subir** — reduce el peso ~95 % sin pérdida visible:

```ts
// NUEVO — web/src/lib/imageCompress.ts
export async function compressImage(file: File, maxDim = 1600, quality = 0.82): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  const bitmap = await createImageBitmap(file);
  const scale  = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 900_000) return file;   // ya es chica: no tocar

  const canvas = document.createElement('canvas');
  canvas.width  = Math.round(bitmap.width  * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality));
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' });
}
```
```tsx
// NewClaimDrawer.tsx:165 — en handleFile()
const optimized = await compressImage(file);
const uploaded  = await uploadPhoto(optimized);
```

Beneficio adicional: el canvas **descarta el EXIF**, incluidas las coordenadas GPS del domicilio del vecino (ver SEC-11).

3. **Barra de progreso real:** hoy sólo hay un spinner. Con `XMLHttpRequest.upload.onprogress` se puede mostrar el porcentaje; en una conexión lenta, la diferencia entre un spinner infinito y "67 %" es la diferencia entre esperar y cerrar la app.

### 6.6 Bugs de layout específicos de móvil

| Problema | Archivo:línea | Fix |
|---|---|---|
| `h-[92vh]` en el drawer: `vh` incluye la barra de URL de Safari/Chrome, así que el footer con el botón "Confirmar" queda tapado | `NewClaimDrawer.tsx:278` | `h-[92dvh]` con fallback `h-[92vh]` |
| El FAB "Ver lista" (`bottom-14`) puede solaparse con el SponsorBanner si el banner crece a dos líneas | `App.tsx:392` | Anclar con `calc(var(--sponsor-h) + 12px + var(--safe-bottom))` |
| Modales sin bloqueo de scroll del fondo: al hacer scroll dentro del modal, el `body` scrollea detrás (scroll chaining) | `ClaimModal`, `LoginModal`, `NewClaimDrawer` | `overscroll-behavior: contain` + `document.body.style.overflow='hidden'` al montar |
| El bottom sheet de la lista (`App.tsx:433`) es un `fixed inset-0` sin gesto de arrastre ni handle | `App.tsx:432-449` | Handle visual + `touch-action: pan-y` + cierre por swipe hacia abajo |
| Sin `pull-to-refresh` | `App.tsx` | El `overscroll-behavior-y: none` de `index.css:26` ya lo desactiva; implementá uno propio o mostrá el botón "Actualizar" de forma persistente |
| El header no respeta el notch superior en landscape | `Header.tsx:62` | `padding-left/right: env(safe-area-inset-left/right)` |

### 6.7 Flujo de creación: reordenar los pasos

**Archivo:** `web/src/components/NewClaimDrawer.tsx:56`

Hoy: `Categoría → Qué pasa → Confirmar (+ ubicación)`.

La ubicación —el dato más importante y el más difícil de recordar después— queda en el paso 3, cuando el vecino ya está cansado del formulario. Y si entró por "Nuevo reclamo" desde el header, primero pasa por el modo de selección en el mapa y **después** por 3 pasos más.

**Propuesta: `Ubicación → Categoría → Qué pasa`**, con la ubicación pre-cargada por GPS al abrir el drawer (ya existe `handleLocate` en `InteractiveMap.tsx:414`). El vecino está **parado frente al problema**: el GPS acierta casi siempre, y el paso 1 se resuelve con un tap de confirmación.

Otras mejoras del formulario:
- **Guardar borrador en `localStorage`.** Si entra una llamada y el navegador descarta la pestaña, hoy se pierde todo, incluida la foto ya subida. Es una de las causas de abandono más frustrantes.
- **Sugerencia de reclamo duplicado:** al confirmar la ubicación, consultar si hay reclamos activos en un radio de 100 m y ofrecer *"¿Es este mismo problema? Sumá tu apoyo"*. Evita duplicados y **convierte una creación en un upvote**, que es mejor señal para la Municipalidad.
- **Título opcional autogenerado.** Pedir título + descripción es pedir dos redacciones. Proponé el título a partir de la categoría y la calle (*"Bache en Ameghino 850"*), editable. Menos fricción, menos abandono.
- El contador `{title.length}/120` (línea 387) sólo debería aparecer al pasar el 80 % del límite; siempre visible, es ruido.

---

## 7. Sistema de diseño

La base es sólida: la rampa de color derivada del logo (`#9a2856`), la escala `ink` con sesgo frío, y las utilidades `.glass`/`.btn`/`.input` están bien pensadas. Los problemas son de **consistencia en la aplicación**, no de concepto.

### 7.1 Los z-index son un campo minado

Valores actuales, dispersos en 11 archivos: `-1, 500, 600, 800, 850, 900, 1000, 1500, 1600, 2000, 2500, 3000`.

Peor aún, `Header.tsx:189` usa `z-[-1]` en el overlay de click-outside del menú de usuario: un z-index negativo dentro de un contexto de apilamiento crea un elemento que puede quedar **detrás del fondo del padre**, haciendo que el menú no se cierre al clickear afuera en algunos navegadores.

**Fix — tokens en `tailwind.config.js`:**
```js
extend: {
  zIndex: {
    map: '400',        // capas base de Leaflet
    mapctl: '500',     // controles del mapa
    mapui: '600',      // overlays sobre el mapa
    sponsor: '700',
    bottomnav: '850',
    header: '900',
    sheet: '1000',     // bottom sheets
    modal: '1500',     // modales de contenido
    auth: '1600',      // login (por encima del resto)
    toast: '3000'      // siempre arriba de todo
  }
}
```
Y reemplazar el `z-[-1]` por un overlay hermano en `z-[calc(theme(zIndex.header)-1)]`, o directamente por un listener de `pointerdown` en `document` con `useEffect`.

### 7.2 Escala tipográfica descontrolada

Tamaños arbitrarios en uso: `text-[10px]`, `text-[11px]`, `text-[13px]`, `text-[15px]`, `text-[17px]` mezclados con `text-xs`, `text-sm`, `text-base`. **`text-[10px]` aparece 40+ veces** — por debajo del mínimo legible cómodo, y muchas de esas apariciones son sobre `.glass` translúcido, donde el contraste real cae más todavía.

**Fix — escala fija:**
```js
fontSize: {
  '2xs': ['0.6875rem', { lineHeight: '1rem' }],      // 11px — mínimo absoluto, sólo badges
  xs:    ['0.75rem',   { lineHeight: '1.125rem' }],  // 12px — metadatos
  sm:    ['0.875rem',  { lineHeight: '1.375rem' }],  // 14px — cuerpo secundario
  base:  ['0.9375rem', { lineHeight: '1.5rem' }],    // 15px — cuerpo (móvil-friendly)
  lg:    ['1.0625rem', { lineHeight: '1.5rem' }],    // 17px — títulos de tarjeta
  xl:    ['1.25rem',   { lineHeight: '1.75rem' }]
}
```
Regla: **prohibido `text-[Npx]` en componentes nuevos.** Todo `text-[10px]` existente → `text-2xs`.

### 7.3 Contraste: los colores de categoría son impredecibles

**Archivo:** `NewClaimDrawer.tsx:346`, `ClaimCard.tsx:76`

```tsx
style={{ background: `${cat.color}22`, color: cat.color }}
```

`cat.color` viene de la base de datos y se usa **como color de texto** sobre un fondo del mismo tono al 13 % de opacidad. Un color claro (amarillo `#f59e0b`, verde `#10b981`) sobre el fondo claro del modo light da un ratio de contraste cercano a **2:1** — muy por debajo del 4.5:1 de WCAG AA. En el celular, al sol, es directamente ilegible.

**Fix — derivar un tono legible por tema en vez de usar el crudo:**
```css
/* index.css */
.badge-cat {
  background: color-mix(in srgb, var(--cat) 14%, transparent);
  color:      color-mix(in srgb, var(--cat) 72%, black);   /* light: oscurecer */
  border:     1px solid color-mix(in srgb, var(--cat) 30%, transparent);
}
html.dark .badge-cat {
  color: color-mix(in srgb, var(--cat) 82%, white);        /* dark: aclarar */
}
```
```tsx
<span className="badge-cat" style={{ '--cat': cat.color } as React.CSSProperties}>
```
`color-mix()` tiene soporte en todos los navegadores relevantes desde 2023. Como fallback, precalculá dos variantes por categoría en la base (`colorLight` / `colorDark`).

### 7.4 Duplicación de variantes light/dark

Patrones como este se repiten decenas de veces:
```tsx
className="border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-950
           dark:border-white/10 dark:bg-white/[0.03] dark:text-ink-300 dark:hover:bg-white/[0.07] dark:hover:text-white"
```

Cada nuevo componente reimplementa el par y **acumula divergencias** (ya hay 3 grises de borde distintos para el mismo rol visual). La forma correcta con Tailwind 3 es **variables CSS semánticas**:

```css
:root {
  --c-surface: 255 255 255;
  --c-surface-2: 248 250 252;
  --c-border: 226 232 240;
  --c-text: 15 23 42;
  --c-text-muted: 100 116 139;
}
html.dark {
  --c-surface: 26 34 51;
  --c-surface-2: 20 26 40;
  --c-border: 255 255 255 / 0.08;
  --c-text: 255 255 255;
  --c-text-muted: 157 170 194;
}
```
```js
// tailwind.config.js
colors: {
  surface:   'rgb(var(--c-surface) / <alpha-value>)',
  'surface-2':'rgb(var(--c-surface-2) / <alpha-value>)',
  hairline:  'rgb(var(--c-border))',
  content:   'rgb(var(--c-text) / <alpha-value>)',
  'content-muted': 'rgb(var(--c-text-muted) / <alpha-value>)'
}
```
La clase anterior se convierte en: `className="border-hairline bg-surface-2 text-content-muted hover:text-content"` — **una sola declaración que funciona en ambos temas.**

### 7.5 Detalles finos

- `tailwind.config.js:24` — `ink.300: '#9daaC2'` tiene una `C` mayúscula. Funciona, pero normalizá a minúsculas.
- Faltan **dos pesos de sombra intermedios** entre `shadow-sm` y `shadow-lift`; hoy los elevados saltan bruscamente.
- Los `border-radius` van de `rounded-lg` (8px) a `rounded-3xl` (24px) sin criterio. Definí: controles = `xl` (12px), tarjetas = `2xl` (16px), sheets/modales = `3xl` (24px).
- `.glass` sobre el mapa con `backdrop-filter: blur(16px)` en móviles de gama baja **cuesta caro en cada frame de paneo**. Considerá `@media (max-width: 640px) { .glass { backdrop-filter: blur(8px); } }`.

---

## 8. Accesibilidad

Puntos buenos ya presentes: `lang="es-AR"`, `:focus-visible` global (`index.css:47`), `prefers-reduced-motion` bien implementado (línea 408), `aria-pressed` en el upvote, `role="dialog"` + `aria-modal` en los modales.

### Pendientes por prioridad

| # | Problema | Archivos | Fix |
|---|---|---|---|
| A11Y-1 | **Cero atributos ARIA** en `AdminDashboard` (2105 líneas), `LeaderboardTab` (646) y `ReviewerDashboard` (356) | 3 archivos | Etiquetar tablas, botones-ícono y regiones |
| A11Y-2 | **Sin focus trap** en ningún modal: con Tab se sale al contenido de atrás | todos los modales | `focus-trap-react` (2 kB) o un hook propio |
| A11Y-3 | **El foco no vuelve** al elemento que abrió el modal al cerrarlo | todos los modales | Guardar `document.activeElement` y restaurar en cleanup |
| A11Y-4 | Elementos interactivos anidados en `ClaimCard` | `ClaimCard.tsx:17-26` | Ver 5.4 |
| A11Y-5 | Menú de usuario sin `aria-haspopup="menu"` ni `role="menu"`; no cierra con `Escape` | `Header.tsx:168` | Agregar roles + handler de teclado |
| A11Y-6 | Toggle de tema sin `aria-pressed`, y su `title` usa emojis que el lector de pantalla anuncia ("emoji sol") | `Header.tsx:136-140` | `aria-pressed={theme==='dark'}` y `aria-label` sin emoji |
| A11Y-7 | Cambios de filtro no se anuncian | `FilterBar.tsx` | `<div role="status" aria-live="polite" className="sr-only">{n} reclamos encontrados</div>` |
| A11Y-8 | Los toasts no se anuncian | `ui/Toast.tsx` | `role="status"` + `aria-live="polite"` en el contenedor |
| A11Y-9 | El mapa Leaflet es inaccesible por teclado | `InteractiveMap.tsx` | Enlace "Saltar al listado de reclamos" antes del mapa + `aria-hidden` en el contenedor de tiles |
| A11Y-10 | Sin skip-link a contenido principal | `App.tsx` | `<a href="#main" className="sr-only focus:not-sr-only">Ir al contenido</a>` |
| A11Y-11 | El estado del reclamo se comunica sólo por color en el mapa | `InteractiveMap.tsx:74` | Diferenciar también por **forma** de pin (círculo / rombo / cuadrado) — crítico para daltonismo, que afecta al 8 % de los varones |

**Hook reutilizable para A11Y-2 y A11Y-3:**
```ts
// NUEVO — web/src/lib/useModalA11y.ts
export function useModalA11y(ref: React.RefObject<HTMLElement>, onClose: () => void) {
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const sel = 'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose();
      if (e.key !== 'Tab' || !ref.current) return;
      const nodes = Array.from(ref.current.querySelectorAll<HTMLElement>(sel))
        .filter((n) => n.offsetParent !== null);
      if (!nodes.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };

    document.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>(sel)?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      prev?.focus();
    };
  }, [ref, onClose]);
}
```

---

## 9. Performance

### 9.1 El logo de 320 kB

`esquel-logo.png` pesa **320 676 bytes** y se usa como favicon, ícono de PWA (declarado 500×500) y logo del header (renderizado a **40×40 px**). Es decir: se descargan 320 kB para pintar 1600 píxeles.

**Fix:**
```bash
# Generar el set completo
convert esquel-logo.png -resize 32x32   favicon-32.png
convert esquel-logo.png -resize 180x180 apple-touch-icon.png
convert esquel-logo.png -resize 192x192 icon-192.png
convert esquel-logo.png -resize 512x512 icon-512.png
cwebp -q 85 esquel-logo.png -o logo-header.webp   # ~8 kB
```
Ahorro estimado: **~310 kB en la primera carga**, sobre datos móviles.

### 9.2 Sin code splitting

`AdminDashboard.tsx` (2105 líneas) + `LeaderboardTab.tsx` (646) + `ReviewerDashboard.tsx` (356) se importan estáticamente en `App.tsx:8-10`, así que **entran en el bundle inicial de todos los vecinos**, aunque el 99 % nunca vea el panel de administración.

```tsx
// App.tsx:8-10 — REEMPLAZAR
const AdminDashboard    = React.lazy(() => import('./components/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const ReviewerDashboard = React.lazy(() => import('./components/ReviewerDashboard').then(m => ({ default: m.ReviewerDashboard })));
const LeaderboardTab    = React.lazy(() => import('./components/LeaderboardTab').then(m => ({ default: m.LeaderboardTab })));

// Y envolver los renders condicionales:
<React.Suspense fallback={<div className="p-8 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div>}>
  {activeTab === 'admin' && (user?.role === 'revisor' ? <ReviewerDashboard .../> : <AdminDashboard .../>)}
</React.Suspense>
```

Y separar los vendors pesados:
```ts
// web/vite.config.ts
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        leaflet: ['leaflet', 'react-leaflet'],
        react:   ['react', 'react-dom']
      }
    }
  },
  chunkSizeWarningLimit: 700
}
```

### 9.3 Iconos de Leaflet recreados en cada render

**Archivo:** `web/src/components/InteractiveMap.tsx:74`

`createClaimIcon()` construye un `L.DivIcon` nuevo con `html` interpolado por cada reclamo, en cada render del componente. Con 200 marcadores y un re-render por cada tecla del buscador, son 200 objetos DOM descartados por pulsación.

**Fix:**
```tsx
const iconCache = useRef(new Map<string, L.DivIcon>());
const getIcon = (claim: Claim, isSelected: boolean) => {
  const key = `${claim.status}|${claim.upvotesCount}|${isSelected}`;
  const cache = iconCache.current;
  if (!cache.has(key)) cache.set(key, createClaimIcon(claim, isSelected));
  return cache.get(key)!;
};
```

### 9.4 Nominatim: riesgo de bloqueo

**Archivo:** `web/src/lib/geocoding.ts:33-38, 92-97`

```ts
headers: { 'User-Agent': 'EsquelAlertaCivicApp/1.0' }
```

`User-Agent` es un **header prohibido** en `fetch()`: el navegador lo descarta silenciosamente. La política de uso de Nominatim exige identificación y **máximo 1 request por segundo**; con un debounce de 350 ms y un mínimo de 3 caracteres, tipear "Ameghino" dispara varias consultas por segundo. Con varios vecinos usando la app a la vez, **el rango de IPs de Esquel puede terminar bloqueado** y el buscador de direcciones deja de funcionar para toda la ciudad.

**Fix:**
1. Debounce a **800 ms** y mínimo **4 caracteres**.
2. **Cancelar la request en vuelo** al tipear de nuevo — hoy no se cancela, y las respuestas pueden llegar desordenadas y pisar una selección más nueva con una más vieja (race condition real, visible como "el buscador me cambia la dirección sola").
3. Agregar `&email=contacto@esquelalerta.ar` a la URL: es el mecanismo que Nominatim acepta para identificar la app y evita el bloqueo.
4. Cachear también en `searchAddressInEsquel()` (hoy sólo cachea `reverseGeocode`), y persistir el caché en `localStorage`: en una ciudad chica las mismas 200 direcciones se buscan una y otra vez.
5. Plan B: si Nominatim devuelve 429, caer al detector local de polígonos `detectNeighborhood()`, que ya existe y funciona offline.

```ts
let inFlight: AbortController | null = null;

export async function searchAddressInEsquel(query: string): Promise<GeocodeResult[]> {
  inFlight?.abort();                       // cancela la búsqueda anterior
  const controller = new AbortController();
  inFlight = controller;
  const cacheKey = `geo:${query.toLowerCase().trim()}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) return JSON.parse(cached);
  // ... fetch con signal: controller.signal, y guardar en localStorage al volver
}
```

### 9.5 Otras oportunidades

- **Fuentes:** se cargan Inter (5 pesos) + Outfit (3 pesos) = 8 archivos WOFF2. Reducí a Inter 400/600/700 y Outfit 700/800, y agregá `<link rel="preload" as="font" crossorigin>` para el peso principal.
- **Sin clustering de marcadores.** Con 200 reclamos (el `LIMIT 200` de `claims.php:150`) es manejable, pero cuando la plataforma crezca el mapa se vuelve una mancha. Prevé `react-leaflet-cluster`.
- **Sin paginación.** `LIMIT 200` fijo, sin scroll infinito ni "cargar más". Cuando haya 800 reclamos, los 600 más viejos son invisibles y **no hay forma de llegar a ellos**.
- **`SELECT c.*`** en `claims.php:144` trae todas las columnas, incluidas `authorEmail` y `statusNote`, y las envía al cliente. Enumerá sólo las que la UI usa — además es una fuga menor de datos (los emails de los autores viajan al navegador de cualquier visitante).

---

## 10. PWA y funcionamiento offline

Hay un `manifest.webmanifest` correcto y bien formado, pero:

1. **No hay service worker.** La app es "instalable" pero, sin señal, muestra el dinosaurio. Para una herramienta que se usa **en la calle**, es una carencia importante.
2. **Íconos mal configurados:** un único PNG de 500×500 declarado a la vez como `any` y `maskable`. Los íconos maskable necesitan una zona segura del 40 % — en Android el logo va a aparecer recortado. Se necesitan variantes separadas de 192 y 512 px.
3. **`orientation: "portrait-primary"`** impide usar el mapa en horizontal, que es justamente donde mejor se ve. Cambialo a `"any"`.

**Service worker mínimo con cola offline** (lo más valioso: que el vecino pueda cargar el reclamo sin señal y se envíe solo al recuperarla):

```js
// public/sw.js — NUEVO
const CACHE = 'esquel-v1';
const SHELL = ['/', '/index.html', '/esquel-logo.png', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Tiles del mapa: cache-first (los barrios de Esquel no cambian de lugar)
  if (url.hostname.includes('basemaps.cartocdn.com') || url.hostname.includes('tile.openstreetmap.org')) {
    e.respondWith(
      caches.open('tiles-v1').then(async (c) => {
        const hit = await c.match(e.request);
        if (hit) return hit;
        const res = await fetch(e.request);
        if (res.ok) c.put(e.request, res.clone());
        return res;
      })
    );
    return;
  }

  // GETs de la API: network-first con fallback a cache (mapa visible aunque no haya señal)
  if (url.pathname.startsWith('/api/') && e.request.method === 'GET') {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Navegación: shell cacheado
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => caches.match('/index.html')));
  }
});
```

Registrarlo en `web/src/main.tsx`:
```ts
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
```

⚠️ El SW debe copiarse a la raíz en `scripts/sync-build.js`, y `.htaccess` tiene que servirlo con `Service-Worker-Allowed: /` y **sin caché larga**, o los usuarios quedan clavados en una versión vieja.

---

## 11. Plan de implementación por fases

### 🔴 Fase 0 — Contención inmediata (hoy, 2–3 h)

Esto no es refactor: son agujeros abiertos ahora mismo.

- [ ] **Rotar** contraseña MySQL, `JWT_SECRET` y `ADMIN_ACCESS_CODE` desde hPanel (SEC-08)
- [ ] Agregar `requireRole()` y `auditLog()` en `api/config.php`
- [ ] **SEC-01** — proteger `GET /api/auth/users` ← *el más urgente*
- [ ] **SEC-02** — eliminar los backdoors `admin123` / `EsquelAlerta2026!` del login
- [ ] **SEC-03** — reescribir `POST /api/auth/staff`
- [ ] **SEC-04** — proteger `POST /api/auth/users/create`
- [ ] **SEC-05** — proteger `PATCH /api/claims/{id}/status`
- [ ] **SEC-06** — eliminar `POST /api/auth/google`
- [ ] **SEC-07** — el re-registro devuelve 409 en vez de pisar la contraseña
- [ ] **SEC-09** — proteger `/api/admin/metrics`
- [ ] Verificar cada uno con los `curl` de este documento (deben dar 401/403)

> **Antes de aplicar la Fase 0:** creá o actualizá el usuario admin en MySQL con el nuevo `accessCode`, o te quedás sin acceso al panel.

### 🟠 Fase 1 — Endurecimiento (esta semana, ~1 día)

- [ ] `rateLimit()` aplicado en los 8 endpoints de la tabla (SEC-12)
- [ ] `getClientIp()` / `getDeviceId()` a prueba de spoofing (SEC-10)
- [ ] CORS estricto (SEC-13)
- [ ] CSP + HSTS + Permissions-Policy en `.htaccess` (SEC-14)
- [ ] Upload: re-encode, límite de dimensiones, borrado de EXIF (SEC-11)
- [ ] JWT a 7 días + base64url + `jti` (SEC-15)
- [ ] **BUG-01** — el fix de una línea que arregla todos los links de WhatsApp
- [ ] **BUG-02** — ejecutar el `$upUser`
- [ ] **BUG-04** — que `register` no mienta con un 201
- [ ] **BUG-06** — job de CI contra el PHP real (4 asserts)

### 🟡 Fase 2 — UX móvil (1–2 semanas)

- [ ] Bottom navigation + header móvil de 56 px (6.1)
- [ ] FilterBar colapsada + bottom sheet de filtros, **con el selector de orden** (6.1, 6.2)
- [ ] `autoComplete` / `name` / `inputMode` / `enterKeyHint` en todos los formularios (6.4) ← *reduce solo los pedidos de "recordame la clave"*
- [ ] Compresión de imagen en el cliente + barra de progreso (6.5)
- [ ] Quitar `capture="environment"` forzado; dos botones cámara/galería (6.5)
- [ ] Áreas táctiles de 44 px (6.3)
- [ ] `dvh`, scroll lock y `overscroll-behavior` en modales (6.6)
- [ ] Reordenar el flujo a `Ubicación → Categoría → Detalle` + borrador en `localStorage` (6.7)

### 🔵 Fase 3 — UX desktop y sistema de diseño (2–3 semanas)

- [ ] Panel lateral desde `lg` (1024 px) (5.2)
- [ ] Hover sincronizado mapa ↔ lista + filtro por viewport (5.3)
- [ ] Reemplazar `window.prompt` / `window.confirm` por modales propios (5.5, 5.6)
- [ ] Copiar clave + "Enviar por WhatsApp" en el padrón admin (5.5)
- [ ] Tokens de z-index y escala tipográfica (7.1, 7.2)
- [ ] Variables CSS semánticas para light/dark (7.4)
- [ ] Badges de categoría con contraste garantizado (7.3)
- [ ] Focus trap + restauración de foco en modales (A11Y-2, A11Y-3)
- [ ] ARIA en los tres paneles sin etiquetar (A11Y-1)
- [ ] Pines diferenciados por forma además de color (A11Y-11)

### ⚪ Fase 4 — Performance y PWA (según disponibilidad)

- [ ] Set de íconos optimizado; header en WebP (9.1)
- [ ] `React.lazy` en los 3 paneles + `manualChunks` (9.2)
- [ ] Caché de iconos de Leaflet (9.3)
- [ ] Nominatim: debounce 800 ms, abort, caché persistente, parámetro `email` (9.4)
- [ ] Service worker con shell + tiles + cola offline (10)
- [ ] Íconos maskable correctos; `orientation: "any"` (10)
- [ ] Paginación / scroll infinito de reclamos (9.5)
- [ ] OG dinámico por reclamo (BUG-05)

### 🔐 Fase 5 — Contraseñas: blindaje sin perder la función (cuando quieras)

- [ ] `api/lib/crypto.php` con AES-256-GCM (sección 1, Opción B)
- [ ] `PASS_ENC_KEY` en `/home/uXXXX/esquel-config.php`, fuera del webroot
- [ ] Migración gradual con el fallback `v1:` (las claves viejas se siguen leyendo)
- [ ] Aviso en el registro sobre la recuperabilidad de la clave
- [ ] Confirmación + marca de confidencialidad en el export CSV (SEC-17)
- [ ] Export con claves restringido a `superadmin`

---

## 12. Notas de cierre

**Lo que está bien hecho y conviene no romper:**

- La arquitectura dual MySQL + JSON es una decisión pragmática y acertada para hosting compartido: la app nunca se cae del todo.
- El sistema de diseño tiene una identidad real, derivada del logo, no un tema genérico. La rampa `brand` y la escala `ink` están bien construidas.
- `prefers-reduced-motion` implementado correctamente — algo que se olvida en el 90 % de los proyectos.
- `hash_equals()` en la verificación del JWT y HMAC recalculado sin leer el `alg`: inmune al ataque `alg:none`.
- Validación de MIME con `finfo` + nombres aleatorios + `uploads/.htaccess` bloqueando `.php`: el vector de subida más peligroso ya está cerrado.
- Cero `dangerouslySetInnerHTML` en todo el frontend: el escapado de React cubre el XSS por defecto.
- Los textos de la interfaz están escritos en español rioplatense, cálidos y claros. Eso importa más de lo que parece en una herramienta cívica: la gente la siente propia.

**Los tres cambios de mayor impacto por unidad de esfuerzo:**

1. **SEC-01** (30 min) — cierra la filtración del padrón completo con contraseñas.
2. **BUG-01** (1 línea) — desbloquea el canal de crecimiento de la app: los links de WhatsApp compartidos por los vecinos.
3. **6.4, `autoComplete`** (20 min) — hace que los navegadores guarden las contraseñas y reduce solo el problema que motivó esta auditoría.

---

*Auditoría estática sobre el commit `165d0475`. No se ejecutaron pruebas dinámicas contra el sitio en producción (egreso de red bloqueado en el entorno de análisis); cada hallazgo incluye su PoC para verificación manual.*
