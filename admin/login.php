<?php
require_once __DIR__ . '/../includes/bootstrap.php';

if (usuario_actual()) {
    redirect('/admin/');
}

$error = null;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!csrf_valido($_POST['csrf_token'] ?? null)) {
        $error = 'Tu sesión expiró. Volvé a intentar.';
    } else {
        $usuario = trim((string) ($_POST['usuario'] ?? ''));
        $password = (string) ($_POST['password'] ?? '');
        $resultado = intentar_login($usuario, $password);
        if ($resultado['ok']) {
            $u = usuario_actual();
            redirect(!empty($u['debe_cambiar_password']) ? '/admin/cambiar-password.php' : '/admin/');
        }
        $error = $resultado['error'];
    }
}
?><!doctype html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Acceso del equipo · Esquel LAB</title>
<meta name="robots" content="noindex, nofollow">
<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/css/style.css">
<link rel="stylesheet" href="/assets/css/admin.css">
</head>
<body class="admin-body">
<div class="login-shell">
  <form class="login-card" method="post" novalidate>
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="36" height="36" style="margin-bottom:18px;">
      <polygon points="24,4 34,20 30,20 24,10 18,20 14,20" fill="var(--brand-mountain, #4A4A4A)"/>
      <polygon points="4,32 44,32 40,40 8,40" fill="var(--brand-accent, #8C2A56)"/>
    </svg>
    <h1>Acceso del equipo</h1>
    <p class="login-sub">Panel de gestión de postulaciones — Esquel LAB.</p>

    <?php if ($error): ?><div class="form-alert" style="margin-bottom:18px;"><?= e($error) ?></div><?php endif; ?>

    <?= csrf_field() ?>
    <div class="field">
      <label for="usuario">Usuario</label>
      <input type="text" id="usuario" name="usuario" autocomplete="username" required autofocus>
    </div>
    <div class="field">
      <label for="password">Contraseña</label>
      <input type="password" id="password" name="password" autocomplete="current-password" required>
    </div>
    <button type="submit" class="btn btn-primary btn-block">Ingresar</button>
    <a href="/" class="login-back">← Volver al sitio</a>
  </form>
</div>
</body>
</html>
