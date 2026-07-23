<?php
require_once __DIR__ . '/../includes/bootstrap.php';

$pageTitle = 'Sala de prensa — Esquel LAB';
$pageDescription = 'Kit de prensa de Esquel LAB: qué es el programa, cómo funciona la gobernanza, datos clave y notas listas para publicar.';
$activeNav = 'medios';
require __DIR__ . '/../includes/header.php';
?>

<section class="page-hero">
  <div class="container">
    <div class="eyebrow"><span class="dot"></span> Sala de prensa</div>
    <h1>Todo lo que necesitás para escribir sobre Esquel LAB</h1>
    <p class="lede">Un kit de prensa pensado para no perder tiempo: el boilerplate, los números, la explicación de la gobernanza y ángulos de nota ya pensados.</p>
  </div>
</section>

<section class="section">
  <div class="container prose">

    <h2>Qué es Esquel LAB, en 100 palabras</h2>
    <div class="copy-block">
      <p id="boilerplate">Esquel LAB (Laboratorio de Destino Esquel) es un programa municipal de la Subsecretaría de Turismo y la Subsecretaría de Producción que acompaña a emprendedores urbanos y productores rurales para transformar servicios y saberes existentes en experiencias turísticas comercializables. Se organiza en dos líneas: Esquel Acelera, para el ámbito urbano, y Raíz, para el ámbito rural. Cada edición dura 8 semanas de trabajo intensivo, con acompañamiento técnico individual y grupal, y cierra con la presentación pública de las experiencias ante operadores y prensa. La selección de participantes está a cargo de un Cuadro Técnico mixto integrado por el municipio y el sector privado.</p>
      <button class="copy-btn" data-copy-target="#boilerplate">Copiar</button>
    </div>

    <h2>Los números clave</h2>
    <div class="table-wrap">
      <table class="content-table">
        <tbody>
          <tr><td>Líneas del programa</td><td>2 — Esquel Acelera (urbano) y Raíz (rural)</td></tr>
          <tr><td>Duración por edición</td><td>8 semanas de trabajo técnico intensivo</td></tr>
          <tr><td>Convocatoria</td><td>23 de julio al 9 de agosto de 2026</td></tr>
          <tr><td>Trabajo técnico</td><td>10 de agosto al 2 de octubre de 2026</td></tr>
          <tr><td>Experiencias esperadas</td><td>13 a 18 en total (8-10 urbanas + 5-8 rurales)</td></tr>
          <tr><td>Gobernanza</td><td>Municipio + CAMOCH + Cámara de Prestadores + FEHGRA Filial Esquel</td></tr>
        </tbody>
      </table>
    </div>

    <h2>El corazón de la nota: cómo se garantiza un proceso equitativo</h2>
    <p>La legitimidad de Esquel LAB no depende solo del municipio: la selección de postulantes está a cargo de un <strong>Cuadro Técnico de Acompañamiento</strong> integrado, además de la Subsecretaría de Turismo y la Subsecretaría de Producción, por tres instituciones del sector privado:</p>
    <ul>
      <li><strong>CAMOCH</strong> — Cámara de Comercio, Industria, Producción y Turismo del Oeste de Chubut.</li>
      <li><strong>Cámara de Prestadores Turísticos de Esquel</strong> — guías, agencias de turismo activo y transportistas.</li>
      <li><strong>FEHGRA Filial Esquel</strong> (a través de AEHGCLA) — hotelería y gastronomía.</li>
    </ul>
    <p>Este Cuadro Técnico co-diseña la matriz de ponderación y participa activamente del proceso de selección, evaluando cinco dimensiones: diferenciación, impacto en la matriz turística, perfil y motivación del postulante, viabilidad de un producto físico asociado (Economía de los Recuerdos), y viabilidad operativa mínima. El objetivo explícito es evitar que el proceso beneficie solo a emprendimientos ya consolidados, dándole lugar real a los actores nuevos.</p>

    <h2>Comparativa Esquel Acelera / Raíz</h2>
    <div class="table-wrap">
      <table class="content-table">
        <thead><tr><th>Variable</th><th>Esquel Acelera</th><th>Raíz</th></tr></thead>
        <tbody>
          <tr><td>Foco</td><td>Emprendedores, organizaciones y empresas de servicios turísticos urbanos</td><td>Productores y prestadores turísticos rurales</td></tr>
          <tr><td>Resultado esperado</td><td>8 a 10 experiencias urbanas</td><td>5 a 8 experiencias rurales</td></tr>
          <tr><td>Producto físico asociado</td><td>Evaluado caso a caso</td><td>Vínculo directo (lana, dulces, bebidas artesanales)</td></tr>
          <tr><td>Sello vinculado</td><td>"Hecho en Esquel"</td><td>"Hecho en Esquel" + nexo con "Origen Chubut"</td></tr>
        </tbody>
      </table>
    </div>

    <h2>Ángulos de nota sugeridos</h2>
    <div class="angle-grid">
      <div class="angle-card">
        <h4>Los saberes invisibles de Esquel</h4>
        <p>Cómo el programa busca poner en valor oficios y lugares que hoy no están estructurados como oferta turística.</p>
      </div>
      <div class="angle-card">
        <h4>La otra cara de la inversión turística</h4>
        <p>En qué se diferencia este acompañamiento del Régimen de Promoción de Inversiones Turísticas — uno pone capital, el otro pone equipo técnico al servicio de quien ya está laburando.</p>
      </div>
      <div class="angle-card">
        <h4>El objeto que te llevás de recuerdo</h4>
        <p>Cómo la "Economía de los Recuerdos" conecta cada experiencia con un producto físico de identidad local.</p>
      </div>
      <div class="angle-card">
        <h4>Quién decide quién entra</h4>
        <p>El mecanismo de gobernanza mixta público-privada detrás de la selección de participantes.</p>
      </div>
    </div>

    <h2>Banco de logos</h2>
    <div class="download-grid">
      <a class="download-card" href="/assets/brand-source/municipio-esquel-logo.png" download>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></svg>
        <span><span class="name">Municipio de Esquel</span><br><span class="meta">PNG</span></span>
      </a>
    </div>
    <p class="callout"><span class="lbl">Nota para el equipo</span>Los isotipos de Esquel Acelera, Raíz y Esquel LAB en alta resolución se suman a este banco apenas estén disponibles los archivos fuente — ver preguntas abiertas en <code class="inline" style="background:var(--brand-accent-soft); color:var(--brand-accent); padding:1px 6px; border-radius:5px;">docs/00-investigacion-y-plan.md</code>.</p>

    <h2>Preguntas frecuentes</h2>
    <details class="faq-item">
      <summary>¿Esto es solo para los que ya tienen plata para invertir?</summary>
      <p>No. Esquel LAB no es un régimen de inversión de capital — es acompañamiento técnico gratuito para emprendedores y productores que ya están operando con lo que tienen, y necesitan estructura comercial (precio, canal de venta, materiales) para vender mejor. El municipio también tiene un Régimen de Promoción de Inversiones Turísticas, orientado a proyectos de inversión de mayor escala; son instrumentos distintos y complementarios, no excluyentes.</p>
    </details>
    <details class="faq-item">
      <summary>¿Cómo se eligen los participantes?</summary>
      <p>A través de una matriz de ponderación co-diseñada con el Cuadro Técnico (CAMOCH, Cámara de Prestadores, FEHGRA), que evalúa diferenciación, impacto en la oferta turística, motivación del postulante, viabilidad de un producto físico asociado y viabilidad operativa. No es por orden de llegada.</p>
    </details>
    <details class="faq-item">
      <summary>¿Qué pasa con quienes no queden seleccionados en esta cohorte?</summary>
      <p>Esta es la primera cohorte de un proceso pensado como continuo. A partir de los aprendizajes de esta edición se van a identificar nuevos clusters para programas complementarios.</p>
    </details>
    <details class="faq-item">
      <summary>¿Ya hay resultados de ediciones anteriores en Esquel?</summary>
      <p>Esta es la primera cohorte de Esquel LAB. La metodología tiene precedente regional: un programa comparable, "El Bolsón Acelera", ya trabajó con este enfoque en un destino patagónico cercano, priorizando a los vecinos frente a las grandes inversiones externas.</p>
    </details>

    <h2>Contacto de prensa</h2>
    <p>Subsecretaría de Turismo de Esquel · <a href="mailto:esquellab@esquel.gob.ar">esquellab@esquel.gob.ar</a></p>
  </div>
</section>

<?php require __DIR__ . '/../includes/footer.php'; ?>
