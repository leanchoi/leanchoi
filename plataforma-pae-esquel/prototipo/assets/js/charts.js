/* ============================================================
   TROCHA · motor de gráficos
   SVG a mano, sin librerías. Respeta las especificaciones de
   marca del sistema visual (design/sistema-visual.md §4):
   barras ≤24px con extremo redondeado, líneas de 2px, marcadores
   ≥8px con anillo de superficie, separación de 2px entre marcas
   que se tocan, grilla en filete sólido, etiquetado selectivo.
   ============================================================ */
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const el = (n, a = {}) => {
    const e = document.createElementNS(NS, n);
    for (const k in a) if (a[k] != null) e.setAttribute(k, a[k]);
    return e;
  };
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const SERIES = () => [css('--s1'), css('--s2'), css('--s3'), css('--s4'), css('--s5'), css('--s6')];
  const RAMP = () => [css('--q1'), css('--q2'), css('--q3'), css('--q4'), css('--q5'), css('--q6'), css('--q7')];

  /* luminancia relativa (WCAG) para elegir tinta sobre un relleno */
  const lum = (hex) => {
    const m = hex.replace('#', '');
    const v = [0, 2, 4].map(i => {
      const c = parseInt(m.substr(i, 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };

  /* Elige la tinta que MÁS contrasta contra el relleno.
     Un umbral fijo de luminancia falla en los tonos medios de la rampa:
     hay que comparar las dos opciones, no adivinar. */
  const INK_CLARA = '#FBFAF7', INK_OSCURA = '#141A1F';
  const ratio = (a, b) => {
    const [hi, lo] = a > b ? [a, b] : [b, a];
    return (hi + 0.05) / (lo + 0.05);
  };
  const pickInk = (fill) => {
    const L = lum(fill);
    return ratio(L, lum(INK_CLARA)) >= ratio(L, lum(INK_OSCURA)) ? INK_CLARA : INK_OSCURA;
  };

  const fmt = (n, d = 0) => n.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const compact = (n) => Math.abs(n) >= 1e6 ? (n / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + 'M'
    : Math.abs(n) >= 1e3 ? (n / 1e3).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + 'K'
      : fmt(n);

  /* ---------- tooltip compartido ---------- */
  let tipEl;
  const tip = {
    show(html, x, y) {
      if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'tip'; document.body.appendChild(tipEl); }
      tipEl.innerHTML = html;
      tipEl.style.left = x + 'px';
      tipEl.style.top = y + 'px';
      tipEl.style.opacity = '1';
    },
    hide() { if (tipEl) tipEl.style.opacity = '0'; }
  };

  /* ---------- escalas ---------- */
  const scaleY = (min, max, h, pad) => (v) => pad.t + (h - pad.t - pad.b) * (1 - (v - min) / (max - min || 1));
  const niceTicks = (min, max, count = 4) => {
    const span = max - min || 1;
    const raw = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
    const out = [];
    for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(6));
    return out;
  };

  /* Barra con extremo redondeado y base cuadrada (spec de marca) */
  function barPath(x, y, w, h, r, dir) {
    r = Math.min(r, w / 2, h);
    if (h <= 0.5) return '';
    if (dir === 'up')
      return `M${x} ${y + h} L${x} ${y + r} Q${x} ${y} ${x + r} ${y} L${x + w - r} ${y} Q${x + w} ${y} ${x + w} ${y + r} L${x + w} ${y + h} Z`;
    // dir === 'right'
    return `M${x} ${y} L${x + w - r} ${y} Q${x + w} ${y} ${x + w} ${y + r} L${x + w} ${y + h - r} Q${x + w} ${y + h} ${x + w - r} ${y + h} L${x} ${y + h} Z`;
  }

  /* ============================================================
     lineChart — series en el tiempo, con crosshair y tooltip
     opts: { labels, series:[{name,values,dashFrom}], yFmt, band }
     ============================================================ */
  function lineChart(node, opts) {
    const W = node.clientWidth || 640, H = opts.height || 210;
    const pad = { t: 14, r: opts.padRight ?? 46, b: 24, l: 42 };
    const svg = el('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.aria || '' });
    const colors = SERIES();
    const all = opts.series.flatMap(s => s.values).filter(v => v != null);
    const min = opts.min != null ? opts.min : Math.min(...all);
    const max = opts.max != null ? opts.max : Math.max(...all);
    const ticks = niceTicks(min, max, 4);
    const lo = Math.min(min, ticks[0]), hi = Math.max(max, ticks[ticks.length - 1]);
    const Y = scaleY(lo, hi, H, pad);
    const X = (i) => pad.l + (W - pad.l - pad.r) * (i / (opts.labels.length - 1 || 1));

    // banda de referencia opcional (ej. umbral de poder de compra)
    if (opts.band) {
      svg.appendChild(el('rect', {
        x: pad.l, y: Y(opts.band[1]), width: W - pad.l - pad.r,
        height: Math.max(0, Y(opts.band[0]) - Y(opts.band[1])),
        fill: css('--ok'), opacity: .07
      }));
    }

    ticks.forEach(t => {
      svg.appendChild(el('line', { class: 'gridline', x1: pad.l, x2: W - pad.r, y1: Y(t), y2: Y(t) }));
      const tx = el('text', { class: 'tick', x: pad.l - 8, y: Y(t) + 3.5, 'text-anchor': 'end' });
      tx.textContent = opts.yFmt ? opts.yFmt(t) : compact(t);
      svg.appendChild(tx);
    });
    svg.appendChild(el('line', { class: 'axis-line', x1: pad.l, x2: W - pad.r, y1: Y(lo), y2: Y(lo) }));

    opts.labels.forEach((l, i) => {
      if (opts.labels.length > 8 && i % 2) return;
      const tx = el('text', { x: X(i), y: H - 6, 'text-anchor': 'middle' });
      tx.textContent = l;
      svg.appendChild(tx);
    });

    opts.series.forEach((s, si) => {
      const c = s.color || colors[si % colors.length];
      const pts = s.values.map((v, i) => v == null ? null : [X(i), Y(v)]).filter(Boolean);
      const cut = s.dashFrom != null ? s.dashFrom : pts.length - 1;

      if (s.area) {
        const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' ')
          + ` L${pts[pts.length - 1][0]} ${Y(lo)} L${pts[0][0]} ${Y(lo)} Z`;
        svg.appendChild(el('path', { d, fill: c, opacity: .1 }));
      }
      const seg = (from, to, dash) => {
        const p = pts.slice(from, to + 1);
        if (p.length < 2) return;
        svg.appendChild(el('path', {
          d: p.map((q, i) => (i ? 'L' : 'M') + q[0] + ' ' + q[1]).join(' '),
          fill: 'none', stroke: c, 'stroke-width': 2,
          'stroke-linejoin': 'round', 'stroke-linecap': 'round',
          'stroke-dasharray': dash ? '4 4' : null, opacity: dash ? .65 : 1
        }));
      };
      seg(0, cut, false);
      seg(cut, pts.length - 1, true);

      const last = pts[pts.length - 1];
      svg.appendChild(el('circle', { cx: last[0], cy: last[1], r: 4.5, fill: c, class: 'dot-ring' }));
      if (s.endLabel !== false) {
        const t = el('text', { class: 'lbl', x: last[0] + 9, y: last[1] + 4 });
        t.textContent = s.endLabel || (opts.yFmt ? opts.yFmt(s.values[s.values.length - 1]) : compact(s.values[s.values.length - 1]));
        svg.appendChild(t);
      }
    });

    // capa de interacción: crosshair único para todas las series
    const cross = el('line', { class: 'gridline', y1: pad.t, y2: Y(lo), stroke: css('--ink-3'), opacity: 0 });
    svg.appendChild(cross);
    const dots = opts.series.map((s, si) =>
      el('circle', { r: 4.5, fill: s.color || colors[si % colors.length], class: 'dot-ring', opacity: 0 }));
    dots.forEach(d => svg.appendChild(d));

    opts.labels.forEach((l, i) => {
      const half = (W - pad.l - pad.r) / (opts.labels.length - 1 || 1) / 2;
      const hit = el('rect', { class: 'hit', x: X(i) - half, y: pad.t, width: half * 2, height: Y(lo) - pad.t });
      hit.addEventListener('mouseenter', (ev) => {
        cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i)); cross.setAttribute('opacity', .3);
        let html = `<span class="tip-k">${l}</span>`;
        opts.series.forEach((s, si) => {
          if (s.values[i] == null) return;
          dots[si].setAttribute('cx', X(i)); dots[si].setAttribute('cy', Y(s.values[i])); dots[si].setAttribute('opacity', 1);
          html += `<div><strong>${opts.yFmt ? opts.yFmt(s.values[i]) : compact(s.values[i])}</strong> · ${s.name}</div>`;
        });
        const r = svg.getBoundingClientRect();
        tip.show(html, r.left + X(i) * (r.width / W), r.top + pad.t * (r.height / H));
      });
      hit.addEventListener('mouseleave', () => { cross.setAttribute('opacity', 0); dots.forEach(d => d.setAttribute('opacity', 0)); tip.hide(); });
      svg.appendChild(hit);
    });

    node.innerHTML = ''; node.appendChild(svg);
  }

  /* ============================================================
     barsH — barras horizontales / embudo
     data: [{label, value, note, color}]
     ============================================================ */
  function barsH(node, data, opts = {}) {
    const W = node.clientWidth || 560;
    const rowH = opts.rowH || 34, barH = Math.min(22, rowH - 12);
    const H = data.length * rowH + 6;
    const padL = opts.padLeft ?? 150, padR = opts.padRight ?? 62;
    const svg = el('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.aria || '' });
    const max = opts.max || Math.max(...data.map(d => d.value));
    const colors = SERIES();

    data.forEach((d, i) => {
      const y = i * rowH + 4;
      const w = Math.max(0, (W - padL - padR) * (d.value / (max || 1)));
      const c = d.color || opts.color || colors[0];

      const lab = el('text', { x: padL - 12, y: y + barH / 2 + 4, 'text-anchor': 'end', fill: css('--ink-2') });
      lab.textContent = d.label;
      lab.setAttribute('font-size', '11.5');
      svg.appendChild(lab);

      svg.appendChild(el('rect', { x: padL, y, width: W - padL - padR, height: barH, rx: 4, fill: css('--grid'), opacity: .55 }));
      const p = el('path', { d: barPath(padL, y, w, barH, 4, 'right'), fill: c });
      svg.appendChild(p);

      const v = el('text', { class: 'lbl tick', x: padL + w + 9, y: y + barH / 2 + 4 });
      v.textContent = d.display || compact(d.value);
      svg.appendChild(v);

      if (d.note) {
        const n = el('text', { x: W - 4, y: y + barH / 2 + 4, 'text-anchor': 'end', fill: css('--ink-3') });
        n.setAttribute('font-size', '10.5'); n.textContent = d.note;
        svg.appendChild(n);
      }

      const hit = el('rect', { class: 'hit', x: 0, y, width: W, height: barH });
      hit.addEventListener('mousemove', (ev) => tip.show(
        `<span class="tip-k">${d.label}</span><strong>${d.display || fmt(d.value)}</strong>${d.tipNote ? ' · ' + d.tipNote : ''}`,
        ev.clientX, ev.clientY));
      hit.addEventListener('mouseleave', tip.hide);
      svg.appendChild(hit);
    });

    node.innerHTML = ''; node.appendChild(svg);
  }

  /* ============================================================
     barsV — columnas agrupadas (separación de 2px entre vecinas)
     ============================================================ */
  function barsV(node, labels, series, opts = {}) {
    const W = node.clientWidth || 560, H = opts.height || 200;
    const pad = { t: 12, r: 8, b: 26, l: 40 };
    const svg = el('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.aria || '' });
    const colors = SERIES();
    const max = opts.max || Math.max(...series.flatMap(s => s.values));
    const ticks = niceTicks(0, max, 3);
    const hi = Math.max(max, ticks[ticks.length - 1]);
    const Y = scaleY(0, hi, H, pad);

    ticks.forEach(t => {
      svg.appendChild(el('line', { class: 'gridline', x1: pad.l, x2: W - pad.r, y1: Y(t), y2: Y(t) }));
      const tx = el('text', { class: 'tick', x: pad.l - 8, y: Y(t) + 3.5, 'text-anchor': 'end' });
      tx.textContent = compact(t); svg.appendChild(tx);
    });

    const band = (W - pad.l - pad.r) / labels.length;
    const GAP = 2; // separación de superficie entre vecinas
    const bw = Math.min(24, (band * .62 - GAP * (series.length - 1)) / series.length);

    labels.forEach((l, i) => {
      const groupW = bw * series.length + GAP * (series.length - 1);
      const x0 = pad.l + band * i + (band - groupW) / 2;
      series.forEach((s, si) => {
        const x = x0 + si * (bw + GAP);
        const y = Y(s.values[i]), h = Y(0) - y;
        const c = s.color || colors[si % colors.length];
        svg.appendChild(el('path', { d: barPath(x, y, bw, h, 4, 'up'), fill: c }));
        const hit = el('rect', { class: 'hit', x, y: pad.t, width: bw, height: Y(0) - pad.t });
        hit.addEventListener('mousemove', (ev) => tip.show(
          `<span class="tip-k">${l}</span><strong>${fmt(s.values[i])}</strong> · ${s.name}`, ev.clientX, ev.clientY));
        hit.addEventListener('mouseleave', tip.hide);
        svg.appendChild(hit);
      });
      const tx = el('text', { x: pad.l + band * i + band / 2, y: H - 8, 'text-anchor': 'middle' });
      tx.textContent = l; svg.appendChild(tx);
    });
    svg.appendChild(el('line', { class: 'axis-line', x1: pad.l, x2: W - pad.r, y1: Y(0), y2: Y(0) }));
    node.innerHTML = ''; node.appendChild(svg);
  }

  /* ============================================================
     cartogram — cartograma esquemático de barrios
     NO es cartografía: es una grilla ordenada, y se rotula como tal.
     ============================================================ */
  function cartogram(node, cells, opts = {}) {
    const cols = opts.cols || 5;
    const size = opts.size || 72, gap = 5;
    const rows = Math.ceil(cells.length / cols);
    const W = cols * (size + gap), H = rows * (size + gap);
    const svg = el('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.aria || '' });
    const ramp = RAMP();
    const max = Math.max(...cells.map(c => c.value));

    cells.forEach((c, i) => {
      const x = (i % cols) * (size + gap), y = Math.floor(i / cols) * (size + gap);
      const idx = Math.min(ramp.length - 1, Math.floor((c.value / (max || 1)) * (ramp.length - 1) + .001));
      const fill = ramp[idx];
      const g = el('g');
      g.appendChild(el('rect', { class: 'carto-cell', x, y, width: size, height: size, rx: 6, fill }));
      // tinta elegida por contraste medido contra el relleno, en toda la rampa
      const tintaFuerte = pickInk(fill);
      const tintaSuave  = tintaFuerte === INK_CLARA ? 'rgba(251,250,247,.80)' : 'rgba(20,26,31,.64)';
      const t1 = el('text', { class: 'carto-lbl', x: x + 7, y: y + 15, fill: tintaSuave });
      // truncado por ancho real disponible (≈5px por carácter a 8.5px)
      const maxCh = Math.floor((size - 12) / 4.9);
      t1.textContent = c.label.length > maxCh ? c.label.slice(0, maxCh - 1) + '…' : c.label;
      const t2 = el('text', { x: x + 7, y: y + size - 11, fill: tintaFuerte });
      t2.setAttribute('font-size', '19'); t2.setAttribute('font-weight', '600');
      t2.setAttribute('font-variant-numeric', 'tabular-nums');
      t2.textContent = c.display || c.value;
      g.appendChild(t1); g.appendChild(t2);
      g.addEventListener('mousemove', (ev) => tip.show(
        `<span class="tip-k">${c.label}</span><strong>${c.display || c.value}</strong>${c.note ? '<br>' + c.note : ''}`,
        ev.clientX, ev.clientY));
      g.addEventListener('mouseleave', tip.hide);
      svg.appendChild(g);
    });
    node.innerHTML = ''; node.appendChild(svg);
  }

  /* ---------- sparkline (12 puntos, tono atenuado + acento al final) ---------- */
  function spark(node, values, opts = {}) {
    const W = node.clientWidth || 110, H = opts.height || 30;
    const svg = el('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
    const min = Math.min(...values), max = Math.max(...values);
    const X = i => 2 + (W - 4) * (i / (values.length - 1));
    const Y = v => 4 + (H - 8) * (1 - (v - min) / (max - min || 1));
    svg.appendChild(el('path', {
      d: values.map((v, i) => (i ? 'L' : 'M') + X(i) + ' ' + Y(v)).join(' '),
      fill: 'none', stroke: opts.color || css('--ink-3'), 'stroke-width': 1.75,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: .5
    }));
    const n = values.length;
    svg.appendChild(el('path', {
      d: `M${X(n - 2)} ${Y(values[n - 2])} L${X(n - 1)} ${Y(values[n - 1])}`,
      fill: 'none', stroke: opts.accent || css('--accent'), 'stroke-width': 2, 'stroke-linecap': 'round'
    }));
    svg.appendChild(el('circle', { cx: X(n - 1), cy: Y(values[n - 1]), r: 2.6, fill: opts.accent || css('--accent') }));
    node.innerHTML = ''; node.appendChild(svg);
  }

  /* ---------- anillo de progreso (portal del estudiante) ---------- */
  function ring(node, pct, opts = {}) {
    const S = opts.size || 84, r = S / 2 - 7, C = 2 * Math.PI * r;
    const svg = el('svg', { class: 'chart', viewBox: `0 0 ${S} ${S}`, width: S, height: S, role: 'img', 'aria-label': `${pct}% completado` });
    svg.appendChild(el('circle', { cx: S / 2, cy: S / 2, r, fill: 'none', stroke: css('--q1'), 'stroke-width': 7 }));
    svg.appendChild(el('circle', {
      cx: S / 2, cy: S / 2, r, fill: 'none', stroke: opts.color || css('--s3'), 'stroke-width': 7,
      'stroke-linecap': 'round', 'stroke-dasharray': `${C * pct / 100} ${C}`,
      transform: `rotate(-90 ${S / 2} ${S / 2})`
    }));
    const t = el('text', { x: S / 2, y: S / 2 + 6, 'text-anchor': 'middle', fill: css('--ink-1') });
    t.setAttribute('font-size', '19'); t.setAttribute('font-weight', '600');
    t.textContent = pct + '%';
    svg.appendChild(t);
    node.innerHTML = ''; node.appendChild(svg);
  }

  window.Trocha = { lineChart, barsH, barsV, cartogram, spark, ring, fmt, compact, SERIES, RAMP, tip };
})();
