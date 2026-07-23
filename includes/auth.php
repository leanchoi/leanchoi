<?php
/**
 * Autenticación y control de acceso por rol para el panel /admin.
 *
 * Roles: admin (todo) > editor (gestiona postulaciones, no usuarios) > viewer (solo lectura).
 */

require_once __DIR__ . '/db.php';

const ROL_JERARQUIA = ['viewer' => 1, 'editor' => 2, 'admin' => 3];

function usuario_actual(): ?array
{
    return $_SESSION['usuario'] ?? null;
}

function requiere_login(): array
{
    $usuario = usuario_actual();
    if (!$usuario) {
        redirect(admin_url('login.php'));
    }
    return $usuario;
}

function requiere_rol(string $rolMinimo): array
{
    $usuario = requiere_login();
    $nivelUsuario = ROL_JERARQUIA[$usuario['rol']] ?? 0;
    $nivelMinimo  = ROL_JERARQUIA[$rolMinimo] ?? 99;
    if ($nivelUsuario < $nivelMinimo) {
        http_response_code(403);
        echo 'No tenés permisos para acceder a esta sección.';
        exit;
    }
    return $usuario;
}

function admin_url(string $path = ''): string
{
    return '/admin/' . ltrim($path, '/');
}

/** Intento de login con rate-limiting simple por usuario + IP. */
function intentar_login(string $usuarioLogin, string $password): array
{
    $pdo = db();
    $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';

    $stmt = $pdo->prepare(
        'SELECT COUNT(*) FROM intentos_login
         WHERE usuario = ? AND ip = ? AND exitoso = 0 AND creado_en > (NOW() - INTERVAL 15 MINUTE)'
    );
    $stmt->execute([$usuarioLogin, $ip]);
    if ((int) $stmt->fetchColumn() >= 6) {
        return ['ok' => false, 'error' => 'Demasiados intentos fallidos. Probá de nuevo en 15 minutos.'];
    }

    $stmt = $pdo->prepare('SELECT * FROM usuarios WHERE usuario = ? AND activo = 1 LIMIT 1');
    $stmt->execute([$usuarioLogin]);
    $usuario = $stmt->fetch();

    $exitoso = $usuario && password_verify($password, $usuario['password_hash']);

    $registrar = $pdo->prepare('INSERT INTO intentos_login (usuario, ip, exitoso) VALUES (?, ?, ?)');
    $registrar->execute([$usuarioLogin, $ip, $exitoso ? 1 : 0]);

    if (!$exitoso) {
        return ['ok' => false, 'error' => 'Usuario o contraseña incorrectos.'];
    }

    $_SESSION['usuario'] = [
        'id'      => (int) $usuario['id'],
        'nombre'  => $usuario['nombre'],
        'usuario' => $usuario['usuario'],
        'email'   => $usuario['email'],
        'rol'     => $usuario['rol'],
        'debe_cambiar_password' => (bool) $usuario['debe_cambiar_password'],
    ];

    return ['ok' => true];
}

function cerrar_sesion(): void
{
    $_SESSION = [];
    session_destroy();
}
