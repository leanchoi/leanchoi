<?php
require_once __DIR__ . '/includes/bootstrap.php';

$pageTitle = 'Esquel LAB — El destino sos vos';
$pageDescription = 'Convocatoria abierta: Esquel Acelera y Raíz, el programa municipal que acompaña a emprendedores y productores a convertir lo que ya hacen en experiencias turísticas listas para vender. Postulá antes del 9 de agosto.';
$activeNav = 'home';
require __DIR__ . '/includes/header.php';
?>

<section class="hero">
  <canvas id="peaksHero" data-peaks></canvas>
  <div class="hero-inner container">
    <div class="eyebrow"><span class="dot"></span> Convocatoria abierta · Cohorte 01 · 2026</div>
    <h1>Esquel es turístico. Esto lo prueba.</h1>
    <p class="lede">Un programa municipal de acompañamiento intensivo para convertir lo que ya hacés —un servicio, un saber, un lugar— en una experiencia turística lista para vender. Ocho semanas, equipo técnico al lado tuyo, resultados concretos al cierre.</p>
    <div class="hero-cta">
      <a href="/postulacion/" class="btn btn-primary btn-lg">Quiero postularme</a>
      <a href="#elegi-tu-camino" class="btn btn-ghost btn-lg">¿Acelera o Raíz?</a>
    </div>
    <div class="hero-meta">
      <div><div class="k">Cierre de postulaciones</div><div class="v">9 de agosto</div></div>
      <div><div class="k">Inicio del trabajo técnico</div><div class="v">10 de agosto</div></div>
      <div><div class="k">Cierre de cohorte</div><div class="v">2 de octubre</div></div>
      <div><div class="k">Dedicación mínima</div><div class="v">12 hs / semana</div></div>
    </div>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="section-head">
      <div class="eyebrow">El problema, en una frase</div>
      <h2>Sobran ideas, saberes y lugares. Falta que se conviertan en algo que se pueda vender.</h2>
      <p>Esquel es la puerta al Parque Nacional Los Alerces, a La Trochita, a La Hoya. El destino no necesita más paisaje: necesita que la oferta que ya existe —casas de té, talleres, changos con saberes, chacras, productores— tenga precio, canal de venta y materiales listos para un operador. Eso es exactamente lo que hace Esquel LAB.</p>
    </div>
  </div>
</section>

<section class="section section-tight" id="elegi-tu-camino">
  <div class="container">
    <div class="section-head">
      <div class="eyebrow">Dos caminos, una metodología</div>
      <h2>Elegí el que es tuyo</h2>
      <p>Ambos comparten equipo técnico, cronograma y el enfoque de la Economía de los Recuerdos. Lo que cambia es el terreno.</p>
    </div>
    <div class="programs-grid">
      <a href="/postulacion/?programa=acelera" class="program-card acelera">
        <span class="tag">Urbano</span>
        <h3>Esquel Acelera</h3>
        <p>Para emprendedores, organizaciones y empresas de servicios turísticos urbanos: casas de té, talleres artesanales, circuitos históricos, propuestas gastronómicas, actividades de naturaleza urbana — y saberes de oficios que hoy no son turismo, pero podrían serlo.</p>
        <div class="stat-row">
          <div><div class="num">8–10</div><div class="lbl">Experiencias esperadas</div></div>
          <div><div class="num">8</div><div class="lbl">Semanas</div></div>
        </div>
        <span class="go">Postularme a Acelera →</span>
      </a>
      <a href="/postulacion/?programa=raiz" class="program-card raiz">
        <span class="tag">Rural</span>
        <h3>Raíz</h3>
        <p>Para productores y prestadores rurales: chacras, estancias, viñedos, crianceros, productores de lana, fruta fina y dulces regionales con procesos visitables. La labor diaria del campo, convertida en experiencia.</p>
        <div class="stat-row">
          <div><div class="num">5–8</div><div class="lbl">Experiencias esperadas</div></div>
          <div><div class="num">8</div><div class="lbl">Semanas</div></div>
        </div>
        <span class="go">Postularme a Raíz →</span>
      </a>
    </div>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="section-head">
      <div class="eyebrow">Cómo es el acompañamiento</div>
      <h2>Trabajamos con vos, no te dejamos una guía en PDF</h2>
      <p>El equipo técnico va a tu lugar, construye junto a vos, y al cierre queda algo funcionando — no un informe.</p>
    </div>
    <div class="phases">
      <div class="phase-card">
        <div class="n">01</div>
        <h4>Convocatoria y selección</h4>
        <p>Postulación y evaluación técnica junto al Cuadro Técnico del sector privado.</p>
      </div>
      <div class="phase-card">
        <div class="n">02</div>
        <h4>Diagnóstico en el lugar</h4>
        <p>Visitamos tu emprendimiento o tu campo. Mapeamos fortalezas y qué falta para vender.</p>
      </div>
      <div class="phase-card">
        <div class="n">03</div>
        <h4>Sprint de trabajo conjunto</h4>
        <p>Talleres grupales + mentoría 1:1: precio, canal digital, guión, producto físico asociado.</p>
      </div>
      <div class="phase-card">
        <div class="n">04</div>
        <h4>Presentación y lanzamiento</h4>
        <p>Tu experiencia, lista, presentada ante operadores, prensa y el sector privado de Esquel.</p>
      </div>
    </div>
  </div>
</section>

<section class="section section-tight">
  <div class="container">
    <div class="section-head">
      <div class="eyebrow">El compromiso es mutuo</div>
      <h2>Esto no es una capacitación. Es co-creación con horas reales de por medio.</h2>
    </div>
    <div class="commitment">
      <div class="commitment-card pone">
        <h3>Lo que pone el programa</h3>
        <ul>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg> Un equipo técnico dedicado, trabajando junto a vos en el lugar.</li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg> Mentoría individual 1:1 además de los talleres grupales.</li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg> Materiales listos: ficha técnica, canal digital, fotos, precios.</li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg> Presentación ante operadores receptivos y prensa al cierre.</li>
        </ul>
      </div>
      <div class="commitment-card pide">
        <h3>Lo que se necesita de vos</h3>
        <ul>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg> Un mínimo de <strong>12 horas semanales</strong> dedicadas al proceso.</li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg> Disponibilidad durante las <strong>8 semanas</strong> del sprint (10 ago – 2 oct).</li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg> Ganas reales de terminar con algo funcionando, no solo un diagnóstico.</li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg> Un postulante completo y pensado: es lo primero que evaluamos.</li>
        </ul>
      </div>
    </div>
  </div>
</section>

<section class="scarcity-band">
  <div class="container scarcity-inner">
    <div class="scarcity-copy">
      <h2>Cupos por evaluación técnica, no por orden de llegada</h2>
      <p>8 a 10 lugares en Acelera, 5 a 8 en Raíz. Esta es la primera cohorte — el cierre de postulaciones es real.</p>
    </div>
    <div class="countdown" data-countdown data-deadline="<?= e(str_replace(' ', 'T', FECHA_CIERRE_CONVOCATORIA)) ?>">
      <div class="cell"><div class="num" data-cd-d>–</div><div class="lbl">Días</div></div>
      <div class="cell"><div class="num" data-cd-h>–</div><div class="lbl">Horas</div></div>
      <div class="cell"><div class="num" data-cd-m>–</div><div class="lbl">Min</div></div>
    </div>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="soft-band">
      <h3>Esta es la primera cohorte. Habrá más.</h3>
      <p>Esquel LAB arranca priorizando a quienes hoy pueden dedicarle tiempo y mostrar el camino. De lo que aprendamos en esta cohorte van a salir nuevos clusters y programas complementarios — este es el inicio de un proceso continuo, no una convocatoria única.</p>
    </div>
  </div>
</section>

<section class="section section-tight">
  <div class="container">
    <div class="soft-band gov-strip">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--brand-accent)" stroke-width="1.8"><path d="M12 3 3 8v2h18V8z"/><path d="M5 10v9M9 10v9M15 10v9M19 10v9"/><path d="M3 21h18"/></svg>
      <div class="names">Selección evaluada junto al sector privado: <b>CAMOCH</b>, <b>Cámara de Prestadores Turísticos de Esquel</b> y <b>FEHGRA Filial Esquel</b> co-diseñan los criterios de un proceso equitativo y transparente. <a href="/medios/">Ver cómo funciona →</a></div>
    </div>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="citizen-teaser">
      <div>
        <div class="eyebrow"><span class="dot"></span> Para vecinos de Esquel</div>
        <h2>"Acá no hay nada para hacer" es justo lo que este programa viene a desmentir</h2>
        <p>No hace falta tener un proyecto de inversión grande para ser parte del turismo de Esquel. Este programa pone equipo técnico al servicio de quien ya está laburando con lo que tiene.</p>
        <a href="/esquel-es-turistico/" class="btn btn-ghost">Conocé de qué se trata →</a>
      </div>
      <div class="citizen-art" aria-hidden="true">
        <canvas id="peaksCitizen" data-peaks style="width:100%; height:100%; opacity:1;"></canvas>
      </div>
    </div>
  </div>
</section>

<?php require __DIR__ . '/includes/footer.php'; ?>
