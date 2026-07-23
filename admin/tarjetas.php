<?php
require_once __DIR__ . '/../includes/bootstrap.php';

requiere_rol('viewer');

$filtros = filtros_postulaciones_desde_get();
$postulaciones = buscar_postulaciones($filtros);

$columnas = [];
foreach (ESTADOS as $slug => $info) {
    $columnas[$slug] = [];
}
foreach ($postulaciones as $p) {
    $columnas[$p['estado']][] = $p;
}

$pageTitle = 'Postulaciones — Tarjetas';
$activeAdminNav = 'tarjetas';
require __DIR__ . '/../includes/admin-header.php';
?>

<div class="admin-topbar">
  <h1>Postulaciones</h1>
  <span class="admin-count"><?= count($postulaciones) ?> resultado<?= count($postulaciones) === 1 ? '' : 's' ?></span>
</div>

<div class="admin-content admin-content-wide">
  <?php $vistaActual = 'tarjetas'; require __DIR__ . '/../includes/admin-filtros.php'; ?>

  <?php if (!$postulaciones): ?>
    <div class="admin-empty">No hay postulaciones que coincidan con estos filtros todavía.</div>
  <?php else: ?>
    <div class="kanban">
      <?php foreach (ESTADOS as $slug => $info): ?>
        <div class="kanban-col">
          <div class="kanban-col-head" style="--c: <?= e($info['color']) ?>">
            <span><?= e($info['label']) ?></span>
            <span class="kanban-col-count"><?= count($columnas[$slug]) ?></span>
          </div>
          <div class="kanban-col-body">
            <?php foreach ($columnas[$slug] as $p): ?>
              <a href="/admin/postulacion.php?id=<?= (int) $p['id'] ?>" class="kanban-card">
                <span class="badge-programa badge-<?= e($p['programa']) ?>"><?= e(nombre_programa($p['programa'])) ?></span>
                <div class="kanban-card-title"><?= e($p['nombre_emprendimiento']) ?></div>
                <div class="kanban-card-sub"><?= e($p['nombre_contacto']) ?></div>
                <div class="kanban-card-date"><?= e(fecha_legible($p['creado_en'])) ?></div>
              </a>
            <?php endforeach; ?>
            <?php if (!$columnas[$slug]): ?><div class="kanban-empty">—</div><?php endif; ?>
          </div>
        </div>
      <?php endforeach; ?>
    </div>
  <?php endif; ?>
</div>

<?php require __DIR__ . '/../includes/admin-footer.php'; ?>
