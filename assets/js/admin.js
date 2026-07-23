/**
 * Comportamiento del panel /admin: menú lateral en mobile.
 */
(function () {
  const toggle = document.getElementById('adminSidebarToggle');
  const sidebar = document.getElementById('adminSidebar');
  if (!toggle || !sidebar) return;

  toggle.addEventListener('click', function () {
    const open = sidebar.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  document.addEventListener('click', function (evt) {
    if (!sidebar.classList.contains('open')) return;
    if (sidebar.contains(evt.target) || toggle.contains(evt.target)) return;
    sidebar.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  });
})();
