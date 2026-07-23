<?php
/**
 * Header público. La página que lo incluye debe definir antes:
 *   $pageTitle       (string)  título de <title>, sin el sufijo del sitio
 *   $pageDescription (string)  meta description
 *   $activeNav       (string)  'home' | 'medios' | 'ciudadania' (opcional)
 *   $extraStyles     (array)   hojas de estilo adicionales para esta página (opcional)
 */
$pageTitle       = $pageTitle ?? SITE_NAME;
$pageDescription = $pageDescription ?? 'Programa municipal de aceleración turística de Esquel: Esquel Acelera (urbano) y Raíz (rural).';
$activeNav       = $activeNav ?? '';
$extraStyles     = $extraStyles ?? [];
?><!doctype html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= e($pageTitle) ?><?= $pageTitle !== SITE_NAME ? ' · ' . e(SITE_NAME) : '' ?></title>
<meta name="description" content="<?= e($pageDescription) ?>">
<meta property="og:title" content="<?= e($pageTitle) ?>">
<meta property="og:description" content="<?= e($pageDescription) ?>">
<meta property="og:type" content="website">
<meta name="theme-color" content="#8C2A56">
<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/css/style.css">
<?php foreach ($extraStyles as $href): ?>
<link rel="stylesheet" href="<?= e($href) ?>">
<?php endforeach; ?>
</head>
<body>
<a class="skip-link" href="#contenido">Saltar al contenido</a>

<header class="site-header">
  <div class="container">
    <a class="brand-lockup" href="/">
      <svg class="mark" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <polygon points="24,4 34,20 30,20 24,10 18,20 14,20" fill="var(--brand-mountain, #4A4A4A)"/>
        <polygon points="8,30 16,16 22,26 18,26 14,22 10,30" fill="var(--brand-mountain, #4A4A4A)"/>
        <polygon points="40,30 32,16 26,26 30,26 34,22 38,30" fill="var(--brand-mountain, #4A4A4A)"/>
        <polygon points="4,32 44,32 40,40 8,40" fill="var(--brand-accent, #8C2A56)"/>
      </svg>
      <span class="word">Esquel <b>LAB</b></span>
    </a>
    <button class="nav-toggle" id="navToggle" aria-expanded="false" aria-controls="siteNav" aria-label="Abrir menú">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
    </button>
    <nav class="site-nav" id="siteNav">
      <a href="/" <?= $activeNav === 'home' ? 'aria-current="page"' : '' ?>>Inicio</a>
      <a href="/esquel-es-turistico/" <?= $activeNav === 'ciudadania' ? 'aria-current="page"' : '' ?>>Para vecinos</a>
      <a href="/medios/" <?= $activeNav === 'medios' ? 'aria-current="page"' : '' ?>>Prensa</a>
      <a href="/postulacion/" class="btn btn-primary btn-sm">Postularme</a>
    </nav>
  </div>
</header>

<main id="contenido">
