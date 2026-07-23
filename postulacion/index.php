<?php
require_once __DIR__ . '/../includes/bootstrap.php';

$errores = [];
$valores = [
    'programa' => $_GET['programa'] ?? '',
    'nombre_contacto' => '', 'email' => '', 'telefono' => '',
    'nombre_emprendimiento' => '', 'tipo_figura' => '', 'rubro' => '',
    'anios_operando' => '', 'redes_sociales' => '', 'ubicacion' => '', 'cuit_dni' => '',
    'propuesta_actual' => '', 'diferenciacion' => '', 'matriz_turistica' => '',
    'tiene_producto_fisico' => '', 'producto_fisico' => '',
    'recursos_actuales' => '', 'que_necesita' => '',
    'motivacion' => '', 'compromiso_horas' => '', 'equipo_participante' => '',
    'material_apoyo_url' => '', 'acepto_bases' => '',
];
if (!in_array($valores['programa'], ['acelera', 'raiz'], true)) {
    $valores['programa'] = '';
}

$convocatoriaAbierta = convocatoria_abierta();
$enviado = false;

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $convocatoriaAbierta) {
    if (!csrf_valido($_POST['csrf_token'] ?? null)) {
        $errores['general'] = 'Tu sesión expiró. Volvé a intentar enviar el formulario.';
    } elseif (!empty($_POST['web'])) {
        // honeypot: los bots completan este campo, las personas no lo ven.
        $errores['general'] = 'No pudimos procesar el envío.';
    } else {
        foreach ($valores as $campo => $default) {
            $valores[$campo] = trim((string) ($_POST[$campo] ?? ''));
        }

        if (!in_array($valores['programa'], ['acelera', 'raiz'], true)) {
            $errores['programa'] = 'Elegí Esquel Acelera o Raíz.';
        }
        if ($valores['nombre_contacto'] === '') {
            $errores['nombre_contacto'] = 'Contanos tu nombre.';
        }
        if (!filter_var($valores['email'], FILTER_VALIDATE_EMAIL)) {
            $errores['email'] = 'Necesitamos un email válido para contactarte.';
        }
        if ($valores['nombre_emprendimiento'] === '') {
            $errores['nombre_emprendimiento'] = 'Cómo se llama tu emprendimiento, proyecto u organización.';
        }
        if ($valores['diferenciacion'] === '') {
            $errores['diferenciacion'] = 'Este campo es clave para la evaluación — contanos qué te hace distinto.';
        }
        if ($valores['motivacion'] === '') {
            $errores['motivacion'] = 'Contanos por qué querés hacer esto — es uno de los criterios más importantes.';
        }
        if ($valores['compromiso_horas'] !== 'on') {
            $errores['compromiso_horas'] = 'Necesitamos que confirmes la disponibilidad de 12 hs semanales.';
        }
        if ($valores['acepto_bases'] !== 'on') {
            $errores['acepto_bases'] = 'Tenés que aceptar las bases para enviar la postulación.';
        }
        if (!empty($valores['material_apoyo_url']) && !filter_var($valores['material_apoyo_url'], FILTER_VALIDATE_URL)) {
            $errores['material_apoyo_url'] = 'Ese link no parece válido — revisalo o dejalo vacío.';
        }

        if (!$errores) {
            $stmt = db()->prepare(
                'INSERT INTO postulaciones (
                    programa, nombre_contacto, email, telefono, nombre_emprendimiento,
                    tipo_figura, rubro, anios_operando, redes_sociales, ubicacion, cuit_dni,
                    propuesta_actual, diferenciacion, matriz_turistica,
                    tiene_producto_fisico, producto_fisico,
                    recursos_actuales, que_necesita,
                    motivacion, compromiso_horas, equipo_participante,
                    material_apoyo_url, acepto_bases, ip_envio
                ) VALUES (
                    :programa, :nombre_contacto, :email, :telefono, :nombre_emprendimiento,
                    :tipo_figura, :rubro, :anios_operando, :redes_sociales, :ubicacion, :cuit_dni,
                    :propuesta_actual, :diferenciacion, :matriz_turistica,
                    :tiene_producto_fisico, :producto_fisico,
                    :recursos_actuales, :que_necesita,
                    :motivacion, :compromiso_horas, :equipo_participante,
                    :material_apoyo_url, :acepto_bases, :ip_envio
                )'
            );
            $stmt->execute([
                'programa' => $valores['programa'],
                'nombre_contacto' => $valores['nombre_contacto'],
                'email' => $valores['email'],
                'telefono' => $valores['telefono'] ?: null,
                'nombre_emprendimiento' => $valores['nombre_emprendimiento'],
                'tipo_figura' => $valores['tipo_figura'] ?: null,
                'rubro' => $valores['rubro'] ?: null,
                'anios_operando' => $valores['anios_operando'] ?: null,
                'redes_sociales' => $valores['redes_sociales'] ?: null,
                'ubicacion' => $valores['ubicacion'] ?: null,
                'cuit_dni' => $valores['cuit_dni'] ?: null,
                'propuesta_actual' => $valores['propuesta_actual'] ?: null,
                'diferenciacion' => $valores['diferenciacion'] ?: null,
                'matriz_turistica' => $valores['matriz_turistica'] ?: null,
                'tiene_producto_fisico' => $valores['tiene_producto_fisico'] === 'si' ? 1 : ($valores['tiene_producto_fisico'] === 'no' ? 0 : null),
                'producto_fisico' => $valores['producto_fisico'] ?: null,
                'recursos_actuales' => $valores['recursos_actuales'] ?: null,
                'que_necesita' => $valores['que_necesita'] ?: null,
                'motivacion' => $valores['motivacion'],
                'compromiso_horas' => 1,
                'equipo_participante' => $valores['equipo_participante'] ?: null,
                'material_apoyo_url' => $valores['material_apoyo_url'] ?: null,
                'acepto_bases' => 1,
                'ip_envio' => $_SERVER['REMOTE_ADDR'] ?? null,
            ]);

            redirect('/postulacion/gracias.php');
        }
    }
}

$pageTitle = 'Postulación — Esquel LAB';
$pageDescription = 'Postulate a Esquel Acelera o Raíz. Convocatoria abierta hasta el 9 de agosto de 2026.';
$extraStyles = ['/assets/css/form.css'];
require __DIR__ . '/../includes/header.php';
?>

<section class="form-page">
  <div class="container form-container">

    <?php if (!$convocatoriaAbierta): ?>
      <div class="form-closed">
        <div class="eyebrow"><span class="dot" style="background:var(--warn)"></span> Convocatoria cerrada</div>
        <h1>La ventana de postulación de esta cohorte ya cerró</h1>
        <p>Gracias por el interés. El período de postulación de la Cohorte 01 fue del <?= e(fecha_legible(FECHA_APERTURA_CONVOCATORIA)) ?> al <?= e(fecha_legible(FECHA_CIERRE_CONVOCATORIA)) ?>. Habrá futuras cohortes — dejanos tu contacto y te avisamos.</p>
        <a href="/" class="btn btn-primary">Volver al inicio</a>
      </div>

    <?php else: ?>

      <div class="form-intro">
        <div class="eyebrow"><span class="dot"></span> Cierra el <?= e(fecha_legible(FECHA_CIERRE_CONVOCATORIA)) ?></div>
        <h1>Postulación a Esquel LAB</h1>
        <p>Este formulario tiene 11 pasos cortos y te va a llevar entre 15 y 25 minutos. Cuanto más completo y pensado lo dejes, mejor te podemos evaluar — la reflexión con la que respondas cuenta tanto como el dato en sí. Podés cerrar la pestaña y volver después: guardamos tu progreso en este mismo navegador.</p>
      </div>

      <?php if (!empty($errores['general'])): ?>
        <div class="form-alert"><?= e($errores['general']) ?></div>
      <?php endif; ?>

      <div class="progress-track" aria-hidden="true">
        <div class="progress-fill" id="progressFill"></div>
      </div>
      <p class="progress-label" id="progressLabel">Paso 1 de 11</p>

      <form method="post" id="postulacionForm" novalidate data-had-errors="<?= $errores ? '1' : '0' ?>">
        <?= csrf_field() ?>
        <input type="text" name="web" id="webField" class="visually-hidden" tabindex="-1" autocomplete="off">

        <!-- PASO 0 · Bienvenida -->
        <fieldset class="step-panel" data-step="0">
          <legend class="step-kicker">Antes de arrancar</legend>
          <h2>Qué necesitás tener a mano</h2>
          <ul class="prep-list">
            <li>Una idea clara de qué ofrecés hoy (aunque sea informal).</li>
            <li>Si tenés, fotos o un link a tus redes sociales.</li>
            <li>15-25 minutos sin apuro — las respuestas abiertas valen más si las pensás.</li>
          </ul>
          <p class="step-help">Postularte implica comprometerte a dedicar un mínimo de <strong>12 horas semanales</strong> al proceso de acompañamiento entre el 10 de agosto y el 2 de octubre. Si hoy no podés garantizar ese tiempo, esta no es la cohorte para vos — y está bien, va a haber más adelante.</p>
        </fieldset>

        <!-- PASO 1 · Elegí tu camino -->
        <fieldset class="step-panel" data-step="1">
          <legend class="step-kicker">Paso 1 de 11</legend>
          <h2>¿Acelera o Raíz?</h2>
          <p class="step-help">Elegí el programa que mejor describe tu situación hoy.</p>
          <div class="choice-grid">
            <label class="choice-card">
              <input type="radio" name="programa" value="acelera" <?= $valores['programa'] === 'acelera' ? 'checked' : '' ?>>
              <span class="choice-title">Esquel Acelera</span>
              <span class="choice-desc">Servicio o negocio urbano en marcha: gastronomía, talleres, circuitos, actividades, oficios con potencial turístico.</span>
            </label>
            <label class="choice-card">
              <input type="radio" name="programa" value="raiz" <?= $valores['programa'] === 'raiz' ? 'checked' : '' ?>>
              <span class="choice-title">Raíz</span>
              <span class="choice-desc">Chacra, estancia, viñedo, criancero, producción de lana o fruta fina con procesos visitables.</span>
            </label>
          </div>
          <p class="field-error" data-error-for="programa"><?= e($errores['programa'] ?? '') ?></p>
        </fieldset>

        <!-- PASO 2 · Quién sos -->
        <fieldset class="step-panel" data-step="2">
          <legend class="step-kicker">Paso 2 de 11</legend>
          <h2>Quién sos</h2>
          <div class="field-grid">
            <div class="field">
              <label for="nombre_contacto">Tu nombre *</label>
              <input type="text" id="nombre_contacto" name="nombre_contacto" value="<?= e($valores['nombre_contacto']) ?>" required>
              <p class="field-error" data-error-for="nombre_contacto"><?= e($errores['nombre_contacto'] ?? '') ?></p>
            </div>
            <div class="field">
              <label for="email">Email *</label>
              <input type="email" id="email" name="email" value="<?= e($valores['email']) ?>" required>
              <p class="field-error" data-error-for="email"><?= e($errores['email'] ?? '') ?></p>
            </div>
            <div class="field">
              <label for="telefono">Teléfono / WhatsApp</label>
              <input type="tel" id="telefono" name="telefono" value="<?= e($valores['telefono']) ?>">
            </div>
            <div class="field">
              <label for="nombre_emprendimiento">Nombre de tu emprendimiento, proyecto u organización *</label>
              <input type="text" id="nombre_emprendimiento" name="nombre_emprendimiento" value="<?= e($valores['nombre_emprendimiento']) ?>" required>
              <p class="field-error" data-error-for="nombre_emprendimiento"><?= e($errores['nombre_emprendimiento'] ?? '') ?></p>
            </div>
            <div class="field">
              <label for="tipo_figura">Tipo de figura</label>
              <select id="tipo_figura" name="tipo_figura">
                <option value="">Elegí una opción</option>
                <option value="persona_fisica" <?= $valores['tipo_figura'] === 'persona_fisica' ? 'selected' : '' ?>>Persona física / monotributista</option>
                <option value="empresa" <?= $valores['tipo_figura'] === 'empresa' ? 'selected' : '' ?>>Empresa</option>
                <option value="organizacion" <?= $valores['tipo_figura'] === 'organizacion' ? 'selected' : '' ?>>Organización / tercer sector</option>
                <option value="informal" <?= $valores['tipo_figura'] === 'informal' ? 'selected' : '' ?>>Todavía no formalizado</option>
              </select>
            </div>
            <div class="field">
              <label for="rubro">Rubro / actividad principal</label>
              <input type="text" id="rubro" name="rubro" value="<?= e($valores['rubro']) ?>">
            </div>
            <div class="field">
              <label for="anios_operando">¿Hace cuánto estás en esto?</label>
              <input type="text" id="anios_operando" name="anios_operando" placeholder="Ej: 2 años, recién arranco, toda la vida…" value="<?= e($valores['anios_operando']) ?>">
            </div>
            <div class="field">
              <label for="redes_sociales">Redes sociales o web (si tenés)</label>
              <input type="text" id="redes_sociales" name="redes_sociales" placeholder="@tu_usuario o instagram.com/..." value="<?= e($valores['redes_sociales']) ?>">
            </div>
            <div class="field">
              <label for="ubicacion">Ubicación (barrio, paraje o zona rural)</label>
              <input type="text" id="ubicacion" name="ubicacion" value="<?= e($valores['ubicacion']) ?>">
            </div>
            <div class="field">
              <label for="cuit_dni">CUIT o DNI (opcional)</label>
              <input type="text" id="cuit_dni" name="cuit_dni" value="<?= e($valores['cuit_dni']) ?>">
            </div>
          </div>
        </fieldset>

        <!-- PASO 3 · Tu propuesta -->
        <fieldset class="step-panel" data-step="3">
          <legend class="step-kicker">Paso 3 de 11</legend>
          <h2 data-label-urbano="Contanos tu servicio de hoy" data-label-rural="Contanos tu establecimiento">Contanos tu propuesta</h2>
          <p class="step-help" data-help-urbano="¿Qué ofrecés hoy y a quién se lo vendés? No hace falta que ya sea &quot;turismo&quot; — contanos igual." data-help-rural="¿Qué se produce, qué se podría mostrar o visitar hoy, y cómo es el acceso al lugar?">¿Qué ofrecés hoy y a quién se lo vendés?</p>
          <textarea name="propuesta_actual" rows="5" placeholder="Escribí con tranquilidad — cuanto más contexto des, mejor te entendemos."><?= e($valores['propuesta_actual']) ?></textarea>
        </fieldset>

        <!-- PASO 4 · Diferenciación -->
        <fieldset class="step-panel" data-step="4">
          <legend class="step-kicker">Paso 4 de 11 · Se evalúa</legend>
          <h2>Qué te hace distinto</h2>
          <p class="step-help">No nos cuentes solo el dato — contanos la historia. ¿Qué tiene tu propuesta que no tiene ninguna otra en Esquel?</p>
          <textarea name="diferenciacion" rows="6" required><?= e($valores['diferenciacion']) ?></textarea>
          <p class="field-error" data-error-for="diferenciacion"><?= e($errores['diferenciacion'] ?? '') ?></p>
        </fieldset>

        <!-- PASO 5 · Matriz turística -->
        <fieldset class="step-panel" data-step="5">
          <legend class="step-kicker">Paso 5 de 11 · Se evalúa</legend>
          <h2>Cómo encaja en Esquel</h2>
          <p class="step-help">¿Con qué otros lugares, actores u operadores se podría conectar tu propuesta? ¿A quién le serviría integrarte?</p>
          <textarea name="matriz_turistica" rows="5"><?= e($valores['matriz_turistica']) ?></textarea>
        </fieldset>

        <!-- PASO 6 · Producto físico -->
        <fieldset class="step-panel" data-step="6">
          <legend class="step-kicker">Paso 6 de 11 · Se evalúa</legend>
          <h2>Un objeto que cuente tu historia</h2>
          <p class="step-help">La "Economía de los Recuerdos" plantea que cada experiencia turística puede tener un producto físico asociado —algo que el visitante se lleva— que extiende el recuerdo del viaje. Puede ser un dulce, una pieza de lana, algo hecho a mano.</p>
          <div class="choice-grid choice-grid-3">
            <label class="choice-chip"><input type="radio" name="tiene_producto_fisico" value="si" <?= $valores['tiene_producto_fisico'] === 'si' ? 'checked' : '' ?>> Sí, ya tengo algo así</label>
            <label class="choice-chip"><input type="radio" name="tiene_producto_fisico" value="tal_vez" <?= $valores['tiene_producto_fisico'] === 'tal_vez' ? 'checked' : '' ?>> Podría desarrollarlo</label>
            <label class="choice-chip"><input type="radio" name="tiene_producto_fisico" value="no" <?= $valores['tiene_producto_fisico'] === 'no' ? 'checked' : '' ?>> No lo veo por ahora</label>
          </div>
          <textarea name="producto_fisico" rows="4" placeholder="Contanos más, si aplica…"><?= e($valores['producto_fisico']) ?></textarea>
        </fieldset>

        <!-- PASO 7 · Viabilidad operativa -->
        <fieldset class="step-panel" data-step="7">
          <legend class="step-kicker">Paso 7 de 11 · Se evalúa</legend>
          <h2>Con qué contás hoy</h2>
          <div class="field">
            <label for="recursos_actuales">¿Con qué recursos contás para arrancar? (espacio, equipo, materiales…)</label>
            <textarea id="recursos_actuales" name="recursos_actuales" rows="4"><?= e($valores['recursos_actuales']) ?></textarea>
          </div>
          <div class="field">
            <label for="que_necesita">¿Qué te falta para poder vender esto sin una gran inversión inicial?</label>
            <textarea id="que_necesita" name="que_necesita" rows="4"><?= e($valores['que_necesita']) ?></textarea>
          </div>
        </fieldset>

        <!-- PASO 8 · Motivación -->
        <fieldset class="step-panel" data-step="8">
          <legend class="step-kicker">Paso 8 de 11 · El criterio más importante</legend>
          <h2>Por qué vos</h2>
          <p class="step-help">Este es el campo al que más peso le damos. Las ganas, el compromiso y la voluntad de vincularte con el equipo pesan tanto como cualquier otro criterio técnico — a veces más.</p>
          <textarea name="motivacion" rows="6" placeholder="¿Por qué querés hacer esto? ¿Qué esperás lograr en las 8 semanas?" required><?= e($valores['motivacion']) ?></textarea>
          <p class="field-error" data-error-for="motivacion"><?= e($errores['motivacion'] ?? '') ?></p>

          <div class="field" style="margin-top:22px;">
            <label for="equipo_participante">¿Quién más de tu equipo participaría del acompañamiento?</label>
            <input type="text" id="equipo_participante" name="equipo_participante" placeholder="Vos solo/a, un socio, toda la familia…" value="<?= e($valores['equipo_participante']) ?>">
          </div>

          <label class="check-row" style="margin-top:22px;">
            <input type="checkbox" name="compromiso_horas" <?= $valores['compromiso_horas'] === 'on' ? 'checked' : '' ?>>
            <span>Confirmo que puedo dedicar un mínimo de <strong>12 horas semanales</strong> al proceso entre el 10 de agosto y el 2 de octubre de 2026.</span>
          </label>
          <p class="field-error" data-error-for="compromiso_horas"><?= e($errores['compromiso_horas'] ?? '') ?></p>
        </fieldset>

        <!-- PASO 9 · Material de apoyo -->
        <fieldset class="step-panel" data-step="9">
          <legend class="step-kicker">Paso 9 de 11 · Opcional</legend>
          <h2>Material de apoyo</h2>
          <p class="step-help">Si tenés fotos, un video corto o un álbum, pegá acá un link (Drive, Instagram, lo que tengas). No es obligatorio.</p>
          <div class="field">
            <label for="material_apoyo_url">Link</label>
            <input type="url" id="material_apoyo_url" name="material_apoyo_url" placeholder="https://" value="<?= e($valores['material_apoyo_url']) ?>">
            <p class="field-error" data-error-for="material_apoyo_url"><?= e($errores['material_apoyo_url'] ?? '') ?></p>
          </div>
        </fieldset>

        <!-- PASO 10 · Revisión y envío -->
        <fieldset class="step-panel" data-step="10">
          <legend class="step-kicker">Paso 11 de 11</legend>
          <h2>Revisá y enviá</h2>
          <p class="step-help">Antes de enviar, un repaso rápido de lo que va a leer el equipo técnico:</p>
          <dl class="review-list" id="reviewList"></dl>

          <label class="check-row">
            <input type="checkbox" name="acepto_bases" <?= $valores['acepto_bases'] === 'on' ? 'checked' : '' ?>>
            <span>Leí y acepto las bases del programa Esquel LAB y autorizo el uso de estos datos para el proceso de evaluación.</span>
          </label>
          <p class="field-error" data-error-for="acepto_bases"><?= e($errores['acepto_bases'] ?? '') ?></p>
        </fieldset>

        <div class="step-nav">
          <button type="button" class="btn btn-ghost" id="btnBack">← Anterior</button>
          <button type="button" class="btn btn-primary" id="btnNext">Siguiente →</button>
          <button type="submit" class="btn btn-primary" id="btnSubmit">Enviar postulación</button>
        </div>
      </form>

    <?php endif; ?>
  </div>
</section>

<script src="/assets/js/form.js"></script>

<?php require __DIR__ . '/../includes/footer.php'; ?>
