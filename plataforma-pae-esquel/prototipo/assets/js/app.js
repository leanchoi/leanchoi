/* ============================================================
   TROCHA · shell compartido
   Inyecta la barra lateral, el interruptor de tema y la textura
   topográfica. Cada página solo escribe su contenido.
   ============================================================ */
(() => {

  /* ---------- iconografía: trazo, no relleno; nunca redondeada infantil ---------- */
  const ICON = {
    panel:   '<path d="M3 3h7v7H3zM14 3h7v4h-7zM14 10h7v11h-7zM3 13h7v8H3z"/>',
    persona: '<path d="M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0"/>',
    mapa:    '<path d="M9 3L3 6v15l6-3 6 3 6-3V3l-6 3-6-3zM9 3v15M15 6v15"/>',
    publico: '<path d="M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3a15 15 0 010 18 15 15 0 010-18z"/>',
    inicio:  '<path d="M3 10l9-7 9 7v10a1 1 0 01-1 1h-5v-7H9v7H4a1 1 0 01-1-1z"/>',
    sol:     '<path d="M12 17a5 5 0 100-10 5 5 0 000 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>',
    luna:    '<path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/>',
    tabla:   '<path d="M3 4h18v16H3zM3 9h18M3 14h18M9 4v16"/>'
  };
  const svgIcon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;

  const NAV = [
    { grupo: 'Conducción', items: [
      { href: 'panel.html',        icon: 'panel',   label: 'Panel de conducción' },
      { href: 'territorio.html',   icon: 'mapa',    label: 'Mesa de territorio' }
    ]},
    { grupo: 'Ciudadanía', items: [
      { href: 'estudiante.html',   icon: 'persona', label: 'Portal del estudiante' },
      { href: 'transparencia.html',icon: 'publico', label: 'Portal público' }
    ]},
    { grupo: 'Proyecto', items: [
      { href: 'index.html',        icon: 'inicio',  label: 'Inicio del prototipo' }
    ]}
  ];

  /* ---------- textura de curvas de nivel ---------- */
  function topoSvg() {
    let paths = '';
    for (let i = 0; i < 9; i++) {
      const a = 26 + i * 15, b = 14 + i * 9;
      paths += `<path d="M-40 ${a} C 120 ${a - b}, 260 ${a + b}, 460 ${a - b / 2} S 760 ${a + b}, 1000 ${a - b / 3}" fill="none" stroke="currentColor" stroke-width="1"/>`;
    }
    return `<svg class="topo-svg" viewBox="0 0 900 190" preserveAspectRatio="none" aria-hidden="true" style="color:var(--rule);opacity:.28">${paths}</svg>`;
  }

  /* ---------- tema ---------- */
  const KEY = 'trocha-tema';
  function applyTheme(t) {
    if (t) document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
    const btn = document.getElementById('tema-btn');
    if (btn) {
      const dark = document.documentElement.getAttribute('data-theme') === 'dark'
        || (!document.documentElement.hasAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
      btn.innerHTML = svgIcon(dark ? 'sol' : 'luna');
      btn.setAttribute('aria-label', dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
      btn.style.width = '32px'; btn.style.height = '32px'; btn.style.padding = '0';
      btn.style.justifyContent = 'center';
      btn.querySelector('svg').style.width = '15px';
      btn.querySelector('svg').style.height = '15px';
    }
    document.dispatchEvent(new CustomEvent('trocha:tema'));
  }
  try { applyTheme(localStorage.getItem(KEY)); } catch (e) { /* almacenamiento bloqueado: modo del sistema */ }

  /* ---------- montaje del shell ---------- */
  function mount() {
    const here = location.pathname.split('/').pop() || 'index.html';

    const rail = document.querySelector('.rail');
    if (rail) {
      rail.innerHTML = `
        <div class="brand">
          <div class="brand-mark">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M2 19h20M4 19V9l8-6 8 6v10" stroke="var(--ink-1)" stroke-width="1.7" stroke-linejoin="round"/>
              <path d="M7 19v-5h4v5M14 19v-7h3v7" stroke="var(--accent)" stroke-width="1.7" stroke-linejoin="round"/>
            </svg>
            <div>
              <div class="brand-name">Trocha</div>
              <div class="brand-sub">Gestión PAE · Esquel</div>
            </div>
          </div>
        </div>
        <nav class="nav" aria-label="Secciones">
          ${NAV.map(g => `
            <div class="nav-group">
              <span class="rotulo">${g.grupo}</span>
              ${g.items.map(i => `
                <a href="${i.href}"${i.href === here ? ' aria-current="page"' : ''}>
                  ${svgIcon(i.icon)}<span>${i.label}</span>
                </a>`).join('')}
            </div>`).join('')}
        </nav>
        <div style="padding:14px 20px;border-top:1px solid var(--grid)">
          <span class="demo-badge">Datos demo</span>
          <p class="tiny muted" style="margin:8px 0 0">Cifras sintéticas. No describen el PAE real.</p>
        </div>`;
    }

    const slot = document.getElementById('tema-slot');
    if (slot) {
      slot.innerHTML = '<button class="btn btn-ghost" id="tema-btn" type="button"></button>';
      document.getElementById('tema-btn').addEventListener('click', () => {
        const dark = document.documentElement.getAttribute('data-theme') === 'dark'
          || (!document.documentElement.hasAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
        const next = dark ? 'light' : 'dark';
        try { localStorage.setItem(KEY, next); } catch (e) { /* sin persistencia, no rompe */ }
        applyTheme(next);
      });
      applyTheme(document.documentElement.getAttribute('data-theme'));
    }

    document.querySelectorAll('[data-topo]').forEach(n => n.insertAdjacentHTML('afterbegin', topoSvg()));
  }

  /* ---------- alternador gráfico ⇄ tabla ---------- */
  function tablas() {
    document.querySelectorAll('[data-toggle-tabla]').forEach(btn => {
      const id = btn.getAttribute('data-toggle-tabla');
      btn.addEventListener('click', () => {
        const g = document.getElementById(id + '-graf');
        const t = document.getElementById(id + '-tabla');
        const showTable = t.hasAttribute('hidden');
        t.toggleAttribute('hidden', !showTable);
        g.toggleAttribute('hidden', showTable);
        btn.setAttribute('aria-pressed', String(showTable));
        btn.textContent = showTable ? 'Ver gráfico' : 'Ver tabla';
      });
    });
  }

  window.TrochaApp = { svgIcon, mount, tablas };

  document.addEventListener('DOMContentLoaded', () => { mount(); tablas(); });
})();
