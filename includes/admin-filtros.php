<?php
/**
 * Barra de filtros compartida por la vista lista y la vista tarjetas.
 * Requiere $filtros (de filtros_postulaciones_desde_get()) y $vistaActual ('lista'|'tarjetas').
 */
$queryFiltros = http_build_query(array_filter($filtros));
?>
<form method="get" class="admin-filters">
  <div class="admin-filters-fields">
    <select name="programa">
      <option value="">Todos los programas</option>
      <option value="acelera" <?= $filtros['programa'] === 'acelera' ? 'selected' : '' ?>>Esquel Acelera</option>
      <option value="raiz" <?= $filtros['programa'] === 'raiz' ? 'selected' : '' ?>>Raíz</option>
    </select>
    <select name="estado">
      <option value="">Todos los estados</option>
      <?php foreach (ESTADOS as $slug => $info): ?>
        <option value="<?= e($slug) ?>" <?= $filtros['estado'] === $slug ? 'selected' : '' ?>><?= e($info['label']) ?></option>
      <?php endforeach; ?>
    </select>
    <input type="search" name="q" placeholder="Buscar por nombre, email, rubro…" value="<?= e($filtros['q']) ?>">
    <button type="submit" class="btn btn-ghost btn-sm">Filtrar</button>
    <?php if (array_filter($filtros)): ?><a href="?" class="admin-clear-filters">Limpiar</a><?php endif; ?>
  </div>
  <div class="admin-filters-actions">
    <div class="admin-view-toggle">
      <a href="/admin/?<?= e($queryFiltros) ?>" class="<?= $vistaActual === 'lista' ? 'active' : '' ?>">Lista</a>
      <a href="/admin/tarjetas.php?<?= e($queryFiltros) ?>" class="<?= $vistaActual === 'tarjetas' ? 'active' : '' ?>">Tarjetas</a>
    </div>
    <a href="/admin/exportar.php?<?= e($queryFiltros) ?>" class="btn btn-ghost btn-sm">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 21h16"/></svg>
      Exportar CSV
    </a>
  </div>
</form>
