/**
 * Formulario de postulación — comportamiento multi-etapa.
 *
 * Progressive enhancement: sin este script, el formulario es una única
 * página larga y sigue siendo 100% enviable (todos los campos visibles,
 * botón "Enviar postulación" visible por defecto — ver form.css).
 * Con JS: se muestra un paso a la vez, con barra de progreso, guardado
 * automático en localStorage, y un resumen antes de enviar.
 */
(function () {
  const form = document.getElementById('postulacionForm');
  if (!form) return;

  const STORAGE_KEY = 'esquellab_postulacion_draft_v1';
  const steps = Array.from(form.querySelectorAll('.step-panel'));
  const btnNext = document.getElementById('btnNext');
  const btnBack = document.getElementById('btnBack');
  const btnSubmit = document.getElementById('btnSubmit');
  const progressFill = document.getElementById('progressFill');
  const progressLabel = document.getElementById('progressLabel');
  const progressTrack = progressFill ? progressFill.parentElement : null;

  let current = 0;

  function showError(name, message) {
    const el = form.querySelector('[data-error-for="' + name + '"]');
    if (el) el.textContent = message;
  }
  function clearError(name) {
    showError(name, '');
  }

  function activateStep(i) {
    steps.forEach((panel, idx) => {
      panel.style.display = idx === i ? 'block' : 'none';
    });
    if (progressFill) progressFill.style.width = (((i + 1) / steps.length) * 100) + '%';
    if (progressLabel) progressLabel.textContent = 'Paso ' + (i + 1) + ' de ' + steps.length;
    if (progressTrack) progressTrack.style.display = 'block';
    if (progressLabel) progressLabel.style.display = 'block';

    btnBack.style.display = i === 0 ? 'none' : 'inline-flex';
    if (i === steps.length - 1) {
      btnNext.style.display = 'none';
      btnSubmit.style.display = 'inline-flex';
      buildReview();
    } else {
      btnNext.style.display = 'inline-flex';
      btnSubmit.style.display = 'none';
    }
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function validateStep(i) {
    const panel = steps[i];
    let valid = true;

    panel.querySelectorAll('[required]').forEach((el) => {
      if (!el.checkValidity()) {
        valid = false;
        el.reportValidity();
      }
    });

    const stepNum = panel.getAttribute('data-step');

    if (stepNum === '1') {
      const checked = panel.querySelector('input[name="programa"]:checked');
      if (!checked) {
        valid = false;
        showError('programa', 'Elegí un programa para continuar.');
      } else {
        clearError('programa');
      }
    }

    if (stepNum === '8') {
      const chk = panel.querySelector('input[name="compromiso_horas"]');
      if (chk && !chk.checked) {
        valid = false;
        showError('compromiso_horas', 'Confirmá la disponibilidad horaria para continuar.');
      } else {
        clearError('compromiso_horas');
      }
    }

    return valid;
  }

  function updateProgramLabels() {
    const checked = form.querySelector('input[name="programa"]:checked');
    if (!checked) return;
    const isRaiz = checked.value === 'raiz';
    const h2 = form.querySelector('[data-label-urbano]');
    const help = form.querySelector('[data-help-urbano]');
    if (h2) h2.textContent = isRaiz ? h2.getAttribute('data-label-rural') : h2.getAttribute('data-label-urbano');
    if (help) help.innerHTML = isRaiz ? help.getAttribute('data-help-rural') : help.getAttribute('data-help-urbano');
  }

  function truncate(str, n) {
    if (!str) return '';
    return str.length > n ? str.slice(0, n).trim() + '…' : str;
  }

  function buildReview() {
    const list = document.getElementById('reviewList');
    if (!list) return;
    const fd = new FormData(form);
    const get = (k) => (fd.get(k) || '').toString().trim();

    const programaVal = get('programa');
    const programaLabel = programaVal === 'raiz' ? 'Raíz' : (programaVal === 'acelera' ? 'Esquel Acelera' : '—');

    const rows = [
      ['Programa', programaLabel],
      ['Nombre', get('nombre_contacto') || '—'],
      ['Emprendimiento', get('nombre_emprendimiento') || '—'],
      ['Email', get('email') || '—'],
      ['Qué te hace distinto', truncate(get('diferenciacion'), 160) || '—'],
      ['Por qué vos', truncate(get('motivacion'), 160) || '—'],
      ['Compromiso de 12 hs/semana', fd.get('compromiso_horas') ? 'Confirmado' : 'Sin confirmar'],
    ];

    list.innerHTML = rows.map(([k, v]) =>
      '<dt>' + k + '</dt><dd' + (v === '—' || v === 'Sin confirmar' ? ' class="empty"' : '') + '>' + escapeHtml(v) + '</dd>'
    ).join('');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function saveDraft() {
    try {
      const fd = new FormData(form);
      const data = {};
      fd.forEach((value, key) => {
        if (key === 'csrf_token' || key === 'web') return;
        data[key] = value;
      });
      data.__step = current;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) { /* localStorage no disponible — seguimos sin autosave */ }
  }

  function restoreDraft() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      Object.keys(data).forEach((key) => {
        if (key === '__step') return;
        const els = form.querySelectorAll('[name="' + key.replace(/"/g, '') + '"]');
        els.forEach((el) => {
          if (el.type === 'radio') {
            el.checked = el.value === data[key];
          } else if (el.type === 'checkbox') {
            el.checked = data[key] === 'on';
          } else {
            el.value = data[key];
          }
        });
      });
      if (typeof data.__step === 'number' && data.__step >= 0 && data.__step < steps.length) {
        current = data.__step;
      }
    } catch (e) { /* borrador corrupto o inexistente — arrancamos limpio */ }
  }

  // Restaurar borrador solo si esta carga no viene de una re-validación
  // del servidor (en ese caso los valores repoblados por PHP ya son los
  // correctos y no deben pisarse).
  if (form.getAttribute('data-had-errors') !== '1') {
    restoreDraft();
  }
  updateProgramLabels();
  activateStep(current);

  form.addEventListener('change', () => { updateProgramLabels(); saveDraft(); });
  form.addEventListener('input', debounce(saveDraft, 500));

  btnNext.addEventListener('click', () => {
    if (!validateStep(current)) return;
    saveDraft();
    current = Math.min(current + 1, steps.length - 1);
    activateStep(current);
  });

  btnBack.addEventListener('click', () => {
    current = Math.max(current - 1, 0);
    activateStep(current);
  });

  form.addEventListener('submit', (evt) => {
    if (!validateStep(current)) {
      evt.preventDefault();
      return;
    }
    // Se envía de verdad al servidor (formulario nativo, sin AJAX) —
    // limpiamos el borrador para que una futura visita no arrastre datos viejos.
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  });

  function debounce(fn, wait) {
    let t;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, wait);
    };
  }
})();
