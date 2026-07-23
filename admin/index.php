<?php
require_once __DIR__ . '/../includes/bootstrap.php';

requiere_rol('viewer');

$filtros = filtros_postulaciones_desde_get();
$postulaciones = buscar_postulaciones($filtros);

$pageTitle = 'Postulaciones';
$activeAdminNav = 'lista';
require __DIR__ . '/../includes/admin-header.php';
?>

<div class="admin-topbar">
  <h1>Postulaciones</h1>
  <span class="admin-count"><?= count($postulaciones) ?> resultado<?= count($postulaciones) === 1 ? '' : 's' ?></span>
</div>

<div class="admin-content">
  <?php $vistaActual = 'lista'; require __DIR__ . '/../includes/admin-filtros.php'; ?>

  <?php if (!$postulaciones): ?>
    <div class="admin-empty">No hay postulaciones que coincidan con estos filtros todavía.</div>
  <?php else: ?>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Programa</th>
            <th>Emprendimiento</th>
            <th>Contacto</th>
            <th>Estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <?php foreach ($postulaciones as $p): $estado = estado_info($p['estado']); ?>
            <tr>
              <td class="admin-td-fecha"><?= e(fecha_legible($p['creado_en'])) ?></td>
              <td><span class="badge-programa badge-<?= e($p['programa']) ?>"><?= e(nombre_programa($p['programa'])) ?></span></td>
              <td><strong><?= e($p['nombre_emprendimiento']) ?></strong></td>
              <td>
                <div><?= e($p['nombre_contacto']) ?></div>
                <div class="admin-td-sub"><?= e($p['email']) ?></div>
              </td>
              <td><span class="badge-estado" style="--c: <?= e($estado['color']) ?>"><?= e($estado['label']) ?></span></td>
              <td class="admin-td-actions"><a href="/admin/postulacion.php?id=<?= (int) $p['id'] ?>" class="btn btn-ghost btn-sm">Tomar acción</a></td>
            </tr>
          <?php endforeach; ?>
        </tbody>
      </table>
    </div>
  <?php endif; ?>
</div>

<?php require __DIR__ . '/../includes/admin-footer.php'; ?>
