<?php
require_once __DIR__ . '/../includes/bootstrap.php';

$pageTitle = 'Postulación recibida — Esquel LAB';
$pageDescription = 'Tu postulación a Esquel LAB fue recibida correctamente.';
require __DIR__ . '/../includes/header.php';
?>

<section class="section" style="padding-top:80px;">
  <div class="container" style="max-width:640px;">
    <div class="eyebrow"><span class="dot"></span> Postulación recibida</div>
    <h1 style="font-size:clamp(28px,4vw,40px); margin-bottom:16px;">Gracias — ya la tenemos.</h1>
    <p style="color:var(--ink-soft); font-size:16.5px;">Tu postulación entró al proceso de evaluación del Cuadro Técnico. Estas son las fechas que siguen:</p>

    <div class="phases" style="grid-template-columns:1fr; margin:32px 0;">
      <div class="phase-card">
        <div class="n">01</div>
        <h4>Cierre de convocatoria — <?= e(fecha_legible(FECHA_CIERRE_CONVOCATORIA)) ?></h4>
        <p>Hasta esa fecha se siguen recibiendo y evaluando postulaciones.</p>
      </div>
      <div class="phase-card">
        <div class="n">02</div>
        <h4>Comunicación a seleccionados</h4>
        <p>Te vamos a escribir al email que dejaste, sea cual sea el resultado.</p>
      </div>
      <div class="phase-card">
        <div class="n">03</div>
        <h4>Inicio del trabajo técnico — <?= e(fecha_legible(FECHA_INICIO_TRABAJO_TECNICO)) ?></h4>
        <p>Si fuiste seleccionado/a, ahí arranca el acompañamiento de 8 semanas.</p>
      </div>
    </div>

    <p style="color:var(--ink-soft); font-size:15px;">Mientras tanto, si querés entender mejor de qué se trata todo esto, mirá la <a href="/esquel-es-turistico/">sección para vecinos</a> o compartí el programa con alguien que también debería postularse.</p>

    <a href="/" class="btn btn-ghost" style="margin-top:8px;">Volver al inicio</a>
  </div>
</section>

<?php require __DIR__ . '/../includes/footer.php'; ?>
