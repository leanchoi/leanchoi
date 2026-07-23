<?php
/**
 * Header del panel /admin. Requiere sesión activa (llamar requiere_login()
 * o requiere_rol() ANTES de incluir este archivo).
 * La página que lo incluye debe definir $pageTitle y opcionalmente $activeAdminNav.
 */
$usuarioActual = usuario_actual();
$pageTitle = $pageTitle ?? 'Panel';
$activeAdminNav = $activeAdminNav ?? '';
?><!doctype html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= e($pageTitle) ?> · Panel Esquel LAB</title>
<meta name="robots" content="noindex, nofollow">
<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/css/style.css">
<link rel="stylesheet" href="/assets/css/admin.css">
</head>
<body class="admin-body">

<?php if ($usuarioActual && !empty($usuarioActual['debe_cambiar_password']) && basename($_SERVER['SCRIPT_NAME']) !== 'cambiar-password.php'): ?>
  <div class="admin-force-banner">
    Por seguridad, tenés que cambiar la contraseña provisoria antes de seguir.
    <a href="/admin/cambiar-password.php">Cambiarla ahora →</a>
  </div>
<?php endif; ?>

<button class="admin-sidebar-toggle" id="adminSidebarToggle" aria-label="Abrir menú" aria-expanded="false" aria-controls="adminSidebar">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
</button>

<div class="admin-shell">
  <aside class="admin-sidebar" id="adminSidebar">
    <a href="/" class="admin-brand">
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="26" height="26">
        <polygon points="24,4 34,20 30,20 24,10 18,20 14,20" fill="var(--brand-mountain, #4A4A4A)"/>
        <polygon points="4,32 44,32 40,40 8,40" fill="var(--brand-accent, #8C2A56)"/>
      </svg>
      <span>Esquel LAB</span>
    </a>
    <nav class="admin-nav">
      <a href="/admin/" class="<?= $activeAdminNav === 'lista' ? 'active' : '' ?>">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
        Postulaciones
      </a>
      <a href="/admin/tarjetas.php" class="<?= $activeAdminNav === 'tarjetas' ? 'active' : '' ?>">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>
        Tarjetas
      </a>
      <?php if ($usuarioActual && $usuarioActual['rol'] === 'admin'): ?>
      <a href="/admin/usuarios.php" class="<?= $activeAdminNav === 'usuarios' ? 'active' : '' ?>">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        Usuarios
      </a>
      <?php endif; ?>
    </nav>
    <div class="admin-user">
      <div class="admin-user-name"><?= e($usuarioActual['nombre'] ?? '') ?></div>
      <div class="admin-user-role"><?= e(ucfirst($usuarioActual['rol'] ?? '')) ?></div>
      <div class="admin-user-links">
        <a href="/admin/cambiar-password.php">Cambiar contraseña</a>
        <a href="/admin/logout.php">Salir</a>
      </div>
    </div>
  </aside>

  <div class="admin-main">
