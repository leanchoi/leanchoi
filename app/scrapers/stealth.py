"""Tecnicas de evasion de deteccion de bots (fingerprint / stealth).

El objetivo es que un Chromium controlado por Playwright presente la misma
huella que un navegador de un usuario real. Estos parches se inyectan ANTES
de que cargue cualquier script de la pagina (add_init_script), de modo que
las comprobaciones anti-bot los vean ya aplicados.

Cubre las senales mas habituales que usan Booking, Airbnb y servicios
anti-bot (DataDome, PerimeterX, Akamai) para detectar automatizacion:
  - navigator.webdriver
  - navigator.plugins / mimeTypes vacios
  - navigator.languages
  - window.chrome ausente
  - Permissions API que delata headless
  - WebGL vendor/renderer genericos de headless
"""
from __future__ import annotations

# JS que se inyecta en cada documento antes de sus propios scripts.
STEALTH_JS = r"""
(() => {
  // 1) navigator.webdriver -> undefined (la senal #1 de automatizacion)
  try {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  } catch (e) {}

  // 2) Idiomas coherentes con el locale
  try {
    Object.defineProperty(navigator, 'languages', { get: () => ['es-ES', 'es', 'en'] });
  } catch (e) {}

  // 3) Plugins y mimeTypes: headless los tiene vacios; simulamos algunos
  try {
    const makePlugin = (name, filename, desc) => {
      const p = { name, filename, description: desc, length: 1 };
      p[0] = { type: 'application/pdf', suffixes: 'pdf', description: desc };
      return p;
    };
    const plugins = [
      makePlugin('Chrome PDF Plugin', 'internal-pdf-viewer', 'Portable Document Format'),
      makePlugin('Chrome PDF Viewer', 'mhjfbmdgcfjbbpaeojofohoefgiehjai', ''),
      makePlugin('Native Client', 'internal-nacl-plugin', ''),
    ];
    Object.defineProperty(navigator, 'plugins', { get: () => plugins });
    Object.defineProperty(navigator, 'mimeTypes', { get: () => [{ type: 'application/pdf' }] });
  } catch (e) {}

  // 4) window.chrome (presente en Chrome real, ausente en headless puro)
  try {
    if (!window.chrome) {
      window.chrome = { runtime: {}, app: { isInstalled: false }, csi: () => {}, loadTimes: () => {} };
    }
  } catch (e) {}

  // 5) Permissions API: headless devuelve 'denied' de forma inconsistente
  try {
    const orig = navigator.permissions && navigator.permissions.query;
    if (orig) {
      navigator.permissions.query = (params) =>
        params && params.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission })
          : orig(params);
    }
  } catch (e) {}

  // 6) WebGL vendor/renderer: evitar el "Google SwiftShader" tipico de headless
  try {
    const getParam = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function (p) {
      if (p === 37445) return 'Intel Inc.';            // UNMASKED_VENDOR_WEBGL
      if (p === 37446) return 'Intel Iris OpenGL Engine'; // UNMASKED_RENDERER_WEBGL
      return getParam.call(this, p);
    };
  } catch (e) {}

  // 7) hardwareConcurrency / deviceMemory coherentes con un equipo real
  try {
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
  } catch (e) {}
})();
"""

# Argumentos de lanzamiento de Chromium que reducen la huella de automatizacion.
LAUNCH_ARGS = [
    "--no-sandbox",
    "--disable-blink-features=AutomationControlled",  # quita navigator.webdriver a nivel de motor
    "--disable-dev-shm-usage",
    "--disable-infobars",
    "--disable-features=IsolateOrigins,site-per-process",
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=1440,900",
]

# Palabras/senales que indican que hemos caido en una pagina de bloqueo/captcha.
BLOCK_SIGNALS = [
    "captcha",
    "are you a robot",
    "unusual traffic",
    "access denied",
    "verify you are human",
    "px-captcha",
    "datadome",
    "please enable javascript and cookies",
    "detected unusual activity",
    "confirmar que eres humano",
    "traffico insolito",
]


def looks_blocked(html: str, title: str = "") -> bool:
    """Heuristica: True si el HTML/titulo parece una pantalla anti-bot."""
    haystack = f"{title}\n{html[:6000]}".lower()
    return any(sig in haystack for sig in BLOCK_SIGNALS)
