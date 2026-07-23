<?php
require_once __DIR__ . '/../includes/bootstrap.php';

$usuarioActual = requiere_rol('viewer');
$puedeEditar = ROL_JERARQUIA[$usuarioActual['rol']] >= ROL_JERARQUIA['editor'];

$id = (int) ($_GET['id'] ?? 0);
$stmt = db()->prepare('SELECT * FROM postulaciones WHERE id = ?');
$stmt->execute([$id]);
$p = $stmt->fetch();

if (!$p) {
    http_response_code(404);
    $pageTitle = 'No encontrada';
    require __DIR__ . '/../includes/admin-header.php';
    echo '<div class="admin-content"><div class="admin-empty">Esa postulación no existe.</div></div>';
    require __DIR__ . '/../includes/admin-footer.php';
    exit;
}

$mensaje = null;

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $puedeEditar) {
    if (!csrf_valido($_POST['csrf_token'] ?? null)) {
        $mensaje = ['tipo' => 'error', 'texto' => 'Tu sesión expiró. Volvé a intentar.'];
    } elseif (($_POST['accion'] ?? '') === 'agregar_nota') {
        $texto = trim((string) ($_POST['texto'] ?? ''));
        if ($texto !== '') {
            $stmt = db()->prepare('INSERT INTO notas (postulacion_id, usuario_id, texto) VALUES (?, ?, ?)');
            $stmt->execute([$id, $usuarioActual['id'], $texto]);
            $mensaje = ['tipo' => 'ok', 'texto' => 'Nota agregada.'];
        }
    } elseif (($_POST['accion'] ?? '') === 'cambiar_estado') {
        $nuevoEstado = (string) ($_POST['estado'] ?? '');
        if (array_key_exists($nuevoEstado, ESTADOS) && $nuevoEstado !== $p['estado']) {
            $pdo = db();
            $pdo->beginTransaction();
            $pdo->prepare('UPDATE postulaciones SET estado = ? WHERE id = ?')->execute([$nuevoEstado, $id]);
            $pdo->prepare('INSERT INTO historial_estado (postulacion_id, usuario_id, estado_anterior, estado_nuevo) VALUES (?, ?, ?, ?)')
                ->execute([$id, $usuarioActual['id'], $p['estado'], $nuevoEstado]);
            $pdo->commit();
            $p['estado'] = $nuevoEstado;
            $mensaje = ['tipo' => 'ok', 'texto' => 'Estado actualizado a "' . estado_info($nuevoEstado)['label'] . '".'];
        }
    }
}

$notas = db()->prepare(
    'SELECT n.*, u.nombre AS autor FROM notas n JOIN usuarios u ON u.id = n.usuario_id
     WHERE n.postulacion_id = ? ORDER BY n.creado_en DESC'
);
$notas->execute([$id]);
$notas = $notas->fetchAll();

$historial = db()->prepare(
    'SELECT h.*, u.nombre AS autor FROM historial_estado h JOIN usuarios u ON u.id = h.usuario_id
     WHERE h.postulacion_id = ? ORDER BY h.creado_en DESC'
);
$historial->execute([$id]);
$historial = $historial->fetchAll();

$estadoActual = estado_info($p['estado']);
$pageTitle = $p['nombre_emprendimiento'];
$activeAdminNav = 'lista';
require __DIR__ . '/../includes/admin-header.php';
?>

<div class="admin-topbar">
  <a href="/admin/" class="admin-back">← Volver</a>
  <h1><?= e($p['nombre_emprendimiento']) ?></h1>
  <span class="badge-estado" style="--c: <?= e($estadoActual['color']) ?>"><?= e($estadoActual['label']) ?></span>
</div>

<div class="admin-content admin-detail">

  <?php if ($mensaje): ?>
    <div class="admin-flash admin-flash-<?= e($mensaje['tipo']) ?>"><?= e($mensaje['texto']) ?></div>
  <?php endif; ?>

  <div class="detail-grid">
    <div class="detail-main">

      <section class="admin-panel">
        <h2 class="panel-title">Datos de contacto</h2>
        <dl class="kv-grid">
          <div><dt>Programa</dt><dd><span class="badge-programa badge-<?= e($p['programa']) ?>"><?= e(nombre_programa($p['programa'])) ?></span></dd></div>
          <div><dt>Nombre</dt><dd><?= e($p['nombre_contacto']) ?></dd></div>
          <div><dt>Email</dt><dd><a href="mailto:<?= e($p['email']) ?>"><?= e($p['email']) ?></a></dd></div>
          <div><dt>Teléfono</dt><dd><?= e($p['telefono']) ?: '—' ?></dd></div>
          <div><dt>Tipo de figura</dt><dd><?= e($p['tipo_figura']) ?: '—' ?></dd></div>
          <div><dt>Rubro</dt><dd><?= e($p['rubro']) ?: '—' ?></dd></div>
          <div><dt>Tiempo operando</dt><dd><?= e($p['anios_operando']) ?: '—' ?></dd></div>
          <div><dt>Ubicación</dt><dd><?= e($p['ubicacion']) ?: '—' ?></dd></div>
          <div><dt>Redes sociales</dt><dd><?= e($p['redes_sociales']) ?: '—' ?></dd></div>
          <div><dt>CUIT / DNI</dt><dd><?= e($p['cuit_dni']) ?: '—' ?></dd></div>
        </dl>
      </section>

      <section class="admin-panel">
        <h2 class="panel-title">Respuestas del formulario</h2>
        <div class="answer-block">
          <h3>Su propuesta</h3>
          <p><?= nl2br(e($p['propuesta_actual'])) ?: '<span class="empty">Sin respuesta</span>' ?></p>
        </div>
        <div class="answer-block">
          <h3>Qué la hace distinta (Diferenciación)</h3>
          <p><?= nl2br(e($p['diferenciacion'])) ?: '<span class="empty">Sin respuesta</span>' ?></p>
        </div>
        <div class="answer-block">
          <h3>Cómo encaja en Esquel (Matriz turística)</h3>
          <p><?= nl2br(e($p['matriz_turistica'])) ?: '<span class="empty">Sin respuesta</span>' ?></p>
        </div>
        <div class="answer-block">
          <h3>Producto físico asociado</h3>
          <p class="answer-tag">
            <?php
              $tp = $p['tiene_producto_fisico'];
              echo $tp === null ? '—' : ($tp ? 'Sí / lo está considerando' : 'No, por ahora');
            ?>
          </p>
          <p><?= nl2br(e($p['producto_fisico'])) ?: '<span class="empty">Sin respuesta</span>' ?></p>
        </div>
        <div class="answer-block">
          <h3>Recursos actuales</h3>
          <p><?= nl2br(e($p['recursos_actuales'])) ?: '<span class="empty">Sin respuesta</span>' ?></p>
        </div>
        <div class="answer-block">
          <h3>Qué necesita para arrancar</h3>
          <p><?= nl2br(e($p['que_necesita'])) ?: '<span class="empty">Sin respuesta</span>' ?></p>
        </div>
        <div class="answer-block">
          <h3>Motivación (criterio de mayor peso)</h3>
          <p><?= nl2br(e($p['motivacion'])) ?: '<span class="empty">Sin respuesta</span>' ?></p>
        </div>
        <div class="answer-block">
          <h3>Equipo que participaría</h3>
          <p><?= e($p['equipo_participante']) ?: '<span class="empty">Sin respuesta</span>' ?></p>
        </div>
        <?php if ($p['material_apoyo_url']): ?>
        <div class="answer-block">
          <h3>Material de apoyo</h3>
          <p><a href="<?= e($p['material_apoyo_url']) ?>" target="_blank" rel="noopener"><?= e($p['material_apoyo_url']) ?></a></p>
        </div>
        <?php endif; ?>
      </section>

    </div>

    <div class="detail-side">

      <?php if ($puedeEditar): ?>
      <section class="admin-panel">
        <h2 class="panel-title">Tomar acción</h2>
        <form method="post">
          <?= csrf_field() ?>
          <input type="hidden" name="accion" value="cambiar_estado">
          <div class="field">
            <label for="estado">Cambiar estado</label>
            <select name="estado" id="estado">
              <?php foreach (ESTADOS as $slug => $info): ?>
                <option value="<?= e($slug) ?>" <?= $p['estado'] === $slug ? 'selected' : '' ?>><?= e($info['label']) ?></option>
              <?php endforeach; ?>
            </select>
          </div>
          <button type="submit" class="btn btn-primary btn-block btn-sm">Actualizar estado</button>
        </form>
      </section>
      <?php endif; ?>

      <section class="admin-panel">
        <h2 class="panel-title">Notas del equipo (<?= count($notas) ?>)</h2>

        <?php if ($puedeEditar): ?>
        <form method="post" class="note-form">
          <?= csrf_field() ?>
          <input type="hidden" name="accion" value="agregar_nota">
          <textarea name="texto" rows="3" placeholder="Dejá una nota para el resto del equipo…" required></textarea>
          <button type="submit" class="btn btn-ghost btn-sm">Agregar nota</button>
        </form>
        <?php endif; ?>

        <div class="note-list">
          <?php foreach ($notas as $n): ?>
            <div class="note-item">
              <div class="note-meta"><strong><?= e($n['autor']) ?></strong> · <?= e(fecha_legible($n['creado_en'], true)) ?></div>
              <p><?= nl2br(e($n['texto'])) ?></p>
            </div>
          <?php endforeach; ?>
          <?php if (!$notas): ?><p class="empty">Todavía no hay notas.</p><?php endif; ?>
        </div>
      </section>

      <?php if ($historial): ?>
      <section class="admin-panel">
        <h2 class="panel-title">Historial de estado</h2>
        <div class="history-list">
          <?php foreach ($historial as $h): ?>
            <div class="history-item">
              <span class="badge-estado badge-estado-sm" style="--c: <?= e(estado_info($h['estado_nuevo'])['color']) ?>"><?= e(estado_info($h['estado_nuevo'])['label']) ?></span>
              <span class="history-who"><?= e($h['autor']) ?> · <?= e(fecha_legible($h['creado_en'], true)) ?></span>
            </div>
          <?php endforeach; ?>
        </div>
      </section>
      <?php endif; ?>

    </div>
  </div>
</div>

<?php require __DIR__ . '/../includes/admin-footer.php'; ?>
