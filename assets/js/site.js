/**
 * Comportamiento compartido del sitio público: menú mobile, countdown
 * de convocatoria y botones "copiar" del media kit.
 */
(function () {
  const toggle = document.getElementById('navToggle');
  const nav = document.getElementById('siteNav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      const open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        nav.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // Countdown — lee la fecha límite desde data-deadline (ISO 8601)
  document.querySelectorAll('[data-countdown]').forEach(function (el) {
    const deadline = new Date(el.getAttribute('data-deadline')).getTime();
    const dEl = el.querySelector('[data-cd-d]');
    const hEl = el.querySelector('[data-cd-h]');
    const mEl = el.querySelector('[data-cd-m]');

    function tick() {
      const diff = deadline - Date.now();
      if (diff <= 0) {
        el.classList.add('closed');
        if (dEl) dEl.textContent = '00';
        if (hEl) hEl.textContent = '00';
        if (mEl) mEl.textContent = '00';
        return;
      }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      if (dEl) dEl.textContent = String(d).padStart(2, '0');
      if (hEl) hEl.textContent = String(h).padStart(2, '0');
      if (mEl) mEl.textContent = String(m).padStart(2, '0');
    }
    tick();
    setInterval(tick, 30000);
  });

  // Botones "copiar" del media kit
  document.querySelectorAll('.copy-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const target = document.querySelector(btn.getAttribute('data-copy-target'));
      if (!target) return;
      navigator.clipboard.writeText(target.innerText.trim()).then(function () {
        const original = btn.textContent;
        btn.textContent = 'Copiado';
        btn.classList.add('copied');
        setTimeout(function () { btn.textContent = original; btn.classList.remove('copied'); }, 1800);
      });
    });
  });

  // Inicializa la silueta de montañas en cualquier hero que la tenga
  if (window.EsquelLabPeaks) {
    document.querySelectorAll('canvas[data-peaks]').forEach(function (c) {
      window.EsquelLabPeaks.init(c.id);
    });
  }
})();
