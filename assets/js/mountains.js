/**
 * Silueta de montaña generativa para fondos de hero.
 * Referencia directa al isotipo poligonal de Esquel LAB (picos fracturados
 * en facetas). Semilla fija -> mismo resultado en cada carga, se adapta
 * a light/dark leyendo los custom properties del tema activo.
 */
(function () {
  function initPeaks(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let w, h;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function cssVar(name, fallback) {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    }

    function hexAlpha(hex, alpha) {
      hex = hex.trim();
      if (hex[0] !== '#') return hex;
      let r, g, b;
      if (hex.length === 4) {
        r = parseInt(hex[1] + hex[1], 16); g = parseInt(hex[2] + hex[2], 16); b = parseInt(hex[3] + hex[3], 16);
      } else {
        r = parseInt(hex.slice(1, 3), 16); g = parseInt(hex.slice(3, 5), 16); b = parseInt(hex.slice(5, 7), 16);
      }
      return `rgba(${r},${g},${b},${alpha})`;
    }

    function mulberry32(a) {
      return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    function ridge(rand, baseY, amp, seedOffset, points) {
      const pts = [];
      for (let i = 0; i <= points; i++) {
        const x = (i / points) * w;
        const n = Math.sin(i * 0.7 + seedOffset) * 0.5 + (rand() - 0.5);
        const y = baseY - Math.abs(Math.sin(i * 1.3 + seedOffset)) * amp * (0.4 + rand() * 0.9) - n * 10;
        pts.push([x, y]);
      }
      return pts;
    }

    function drawRidge(pts, fill) {
      ctx.beginPath();
      ctx.moveTo(0, h);
      pts.forEach(([x, y]) => ctx.lineTo(x, y));
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();

      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      for (let i = 1; i < pts.length - 1; i += 2) {
        ctx.beginPath();
        ctx.moveTo(pts[i][0], pts[i][1]);
        ctx.lineTo(pts[i][0] + (pts[i + 1] ? (pts[i + 1][0] - pts[i][0]) * 0.5 : 0), h * 0.92);
        ctx.stroke();
      }
    }

    function draw() {
      if (!w || !h) return;
      ctx.clearRect(0, 0, w, h);
      const r1 = mulberry32(7), r2 = mulberry32(19), r3 = mulberry32(31);
      const ink = cssVar('--ink', '#2A2624');
      const accent = cssVar('--brand-accent', '#8C2A56');
      const pink = cssVar('--brand-pink', '#EE5884');

      drawRidge(ridge(r1, h * 0.92, h * 0.55, 0, 10), hexAlpha(ink, 0.08));
      drawRidge(ridge(r2, h * 0.97, h * 0.65, 2.1, 10), hexAlpha(accent, 0.14));
      drawRidge(ridge(r3, h * 1.02, h * 0.7, 4.4, 10), hexAlpha(pink, 0.16));
    }

    function resize() {
      const rect = canvas.getBoundingClientRect();
      w = rect.width; h = rect.height;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }

    window.addEventListener('resize', resize);
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);
    new MutationObserver(draw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    resize();
  }

  window.EsquelLabPeaks = { init: initPeaks };
})();
