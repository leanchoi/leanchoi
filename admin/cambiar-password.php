<?php
require_once __DIR__ . '/../includes/bootstrap.php';

$usuario = requiere_login();
$error = null;
$exito = false;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!csrf_valido($_POST['csrf_token'] ?? null)) {
        $error = 'Tu sesión expiró. Volvé a intentar.';
    } else {
        $actual = (string) ($_POST['password_actual'] ?? '');
        $nueva = (string) ($_POST['password_nueva'] ?? '');
        $repetir = (string) ($_POST['password_repetir'] ?? '');

        $stmt = db()->prepare('SELECT password_hash FROM usuarios WHERE id = ?');
        $stmt->execute([$usuario['id']]);
        $hashActual = $stmt->fetchColumn();

        if (!$hashActual || !password_verify($actual, $hashActual)) {
            $error = 'La contraseña actual no es correcta.';
        } elseif (strlen($nueva) < 8) {
            $error = 'La contraseña nueva tiene que tener al menos 8 caracteres.';
        } elseif ($nueva !== $repetir) {
            $error = 'Las contraseñas nuevas no coinciden.';
        } else {
            $update = db()->prepare('UPDATE usuarios SET password_hash = ?, debe_cambiar_password = 0 WHERE id = ?');
            $update->execute([password_hash($nueva, PASSWORD_DEFAULT), $usuario['id']]);
            $_SESSION['usuario']['debe_cambiar_password'] = false;
            $exito = true;
        }
    }
}

$pageTitle = 'Cambiar contraseña';
require __DIR__ . '/../includes/admin-header.php';
?>

<div class="admin-topbar">
  <h1>Cambiar contraseña</h1>
</div>

<div class="admin-content admin-content-narrow">
  <?php if ($exito): ?>
    <div class="admin-panel">
      <p class="admin-success">Listo — tu contraseña se actualizó correctamente.</p>
      <a href="/admin/" class="btn btn-primary">Ir al panel</a>
    </div>
  <?php else: ?>
    <form method="post" class="admin-panel" novalidate>
      <?= csrf_field() ?>
      <?php if ($error): ?><div class="form-alert" style="margin-bottom:18px;"><?= e($error) ?></div><?php endif; ?>
      <div class="field">
        <label for="password_actual">Contraseña actual</label>
        <input type="password" id="password_actual" name="password_actual" autocomplete="current-password" required>
      </div>
      <div class="field">
        <label for="password_nueva">Contraseña nueva</label>
        <input type="password" id="password_nueva" name="password_nueva" autocomplete="new-password" minlength="8" required>
      </div>
      <div class="field">
        <label for="password_repetir">Repetir contraseña nueva</label>
        <input type="password" id="password_repetir" name="password_repetir" autocomplete="new-password" minlength="8" required>
      </div>
      <button type="submit" class="btn btn-primary">Guardar contraseña</button>
    </form>
  <?php endif; ?>
</div>

<?php require __DIR__ . '/../includes/admin-footer.php'; ?>
