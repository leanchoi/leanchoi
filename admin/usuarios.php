<?php
require_once __DIR__ . '/../includes/bootstrap.php';

$usuarioActual = requiere_rol('admin');
$mensaje = null;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!csrf_valido($_POST['csrf_token'] ?? null)) {
        $mensaje = ['tipo' => 'error', 'texto' => 'Tu sesión expiró. Volvé a intentar.'];
    } else {
        $accion = $_POST['accion'] ?? '';

        if ($accion === 'crear') {
            $nombre = trim((string) ($_POST['nombre'] ?? ''));
            $usuarioLogin = trim((string) ($_POST['usuario'] ?? ''));
            $email = trim((string) ($_POST['email'] ?? ''));
            $rol = (string) ($_POST['rol'] ?? 'viewer');

            if ($nombre === '' || $usuarioLogin === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || !array_key_exists($rol, ROL_JERARQUIA)) {
                $mensaje = ['tipo' => 'error', 'texto' => 'Revisá los datos del nuevo usuario — falta algo o el email no es válido.'];
            } else {
                $temporal = bin2hex(random_bytes(5));
                try {
                    $stmt = db()->prepare(
                        'INSERT INTO usuarios (nombre, usuario, email, password_hash, rol, activo, debe_cambiar_password)
                         VALUES (?, ?, ?, ?, ?, 1, 1)'
                    );
                    $stmt->execute([$nombre, $usuarioLogin, $email, password_hash($temporal, PASSWORD_DEFAULT), $rol]);
                    $mensaje = ['tipo' => 'ok', 'texto' => "Usuario \"$usuarioLogin\" creado. Contraseña provisoria: $temporal (pedile que la cambie al entrar)."];
                } catch (PDOException $ex) {
                    $mensaje = ['tipo' => 'error', 'texto' => 'Ese usuario o email ya existe.'];
                }
            }
        } elseif ($accion === 'actualizar' && !empty($_POST['id'])) {
            $targetId = (int) $_POST['id'];
            $rol = (string) ($_POST['rol'] ?? 'viewer');
            $activo = !empty($_POST['activo']) ? 1 : 0;

            if ($targetId === (int) $usuarioActual['id'] && $activo === 0) {
                $mensaje = ['tipo' => 'error', 'texto' => 'No podés desactivar tu propio usuario.'];
            } elseif (array_key_exists($rol, ROL_JERARQUIA)) {
                db()->prepare('UPDATE usuarios SET rol = ?, activo = ? WHERE id = ?')->execute([$rol, $activo, $targetId]);
                $mensaje = ['tipo' => 'ok', 'texto' => 'Usuario actualizado.'];
            }
        } elseif ($accion === 'resetear' && !empty($_POST['id'])) {
            $targetId = (int) $_POST['id'];
            $temporal = bin2hex(random_bytes(5));
            db()->prepare('UPDATE usuarios SET password_hash = ?, debe_cambiar_password = 1 WHERE id = ?')
                ->execute([password_hash($temporal, PASSWORD_DEFAULT), $targetId]);
            $mensaje = ['tipo' => 'ok', 'texto' => "Contraseña reseteada. Nueva contraseña provisoria: $temporal"];
        }
    }
}

$usuarios = db()->query('SELECT * FROM usuarios ORDER BY creado_en ASC')->fetchAll();

$pageTitle = 'Usuarios';
$activeAdminNav = 'usuarios';
require __DIR__ . '/../includes/admin-header.php';
?>

<div class="admin-topbar">
  <h1>Usuarios del panel</h1>
</div>

<div class="admin-content admin-detail">
  <?php if ($mensaje): ?>
    <div class="admin-flash admin-flash-<?= e($mensaje['tipo']) ?>"><?= e($mensaje['texto']) ?></div>
  <?php endif; ?>

  <div class="detail-grid">
    <div class="detail-main">
      <section class="admin-panel">
        <h2 class="panel-title">Equipo con acceso</h2>
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead><tr><th>Nombre</th><th>Usuario</th><th>Email</th><th>Rol</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              <?php foreach ($usuarios as $u): ?>
                <tr>
                  <td><?= e($u['nombre']) ?></td>
                  <td class="mono-cell"><?= e($u['usuario']) ?></td>
                  <td><?= e($u['email']) ?></td>
                  <td>
                    <form method="post" class="inline-form">
                      <?= csrf_field() ?>
                      <input type="hidden" name="accion" value="actualizar">
                      <input type="hidden" name="id" value="<?= (int) $u['id'] ?>">
                      <input type="hidden" name="activo" value="<?= (int) $u['activo'] ?>">
                      <select name="rol" onchange="this.form.requestSubmit()">
                        <option value="viewer" <?= $u['rol'] === 'viewer' ? 'selected' : '' ?>>Viewer</option>
                        <option value="editor" <?= $u['rol'] === 'editor' ? 'selected' : '' ?>>Editor</option>
                        <option value="admin" <?= $u['rol'] === 'admin' ? 'selected' : '' ?>>Admin</option>
                      </select>
                    </form>
                  </td>
                  <td>
                    <form method="post" class="inline-form">
                      <?= csrf_field() ?>
                      <input type="hidden" name="accion" value="actualizar">
                      <input type="hidden" name="id" value="<?= (int) $u['id'] ?>">
                      <input type="hidden" name="rol" value="<?= e($u['rol']) ?>">
                      <label class="switch-label">
                        <input type="checkbox" name="activo" onchange="this.form.requestSubmit()" <?= $u['activo'] ? 'checked' : '' ?> <?= (int) $u['id'] === (int) $usuarioActual['id'] ? 'disabled' : '' ?>>
                        <?= $u['activo'] ? 'Activo' : 'Inactivo' ?>
                      </label>
                    </form>
                  </td>
                  <td>
                    <form method="post" class="inline-form" onsubmit="return confirm('¿Resetear la contraseña de <?= e($u['usuario']) ?>?');">
                      <?= csrf_field() ?>
                      <input type="hidden" name="accion" value="resetear">
                      <input type="hidden" name="id" value="<?= (int) $u['id'] ?>">
                      <button type="submit" class="btn btn-ghost btn-sm">Resetear clave</button>
                    </form>
                  </td>
                </tr>
              <?php endforeach; ?>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <div class="detail-side">
      <section class="admin-panel">
        <h2 class="panel-title">Agregar usuario</h2>
        <form method="post">
          <?= csrf_field() ?>
          <input type="hidden" name="accion" value="crear">
          <div class="field"><label for="nombre">Nombre</label><input type="text" id="nombre" name="nombre" required></div>
          <div class="field"><label for="usuario">Usuario (para el login)</label><input type="text" id="usuario" name="usuario" required></div>
          <div class="field"><label for="email">Email</label><input type="email" id="email" name="email" required></div>
          <div class="field">
            <label for="rol">Rol</label>
            <select id="rol" name="rol">
              <option value="viewer">Viewer — solo lectura</option>
              <option value="editor">Editor — gestiona postulaciones</option>
              <option value="admin">Admin — todo</option>
            </select>
          </div>
          <button type="submit" class="btn btn-primary btn-block btn-sm">Crear usuario</button>
          <p class="field-hint">Se genera una contraseña provisoria que vas a ver una sola vez acá — pasásela a la persona y va a tener que cambiarla en su primer ingreso.</p>
        </form>
      </section>
    </div>
  </div>
</div>

<?php require __DIR__ . '/../includes/admin-footer.php'; ?>
