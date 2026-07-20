// SURIA — Cerebro RAG (pestaña "Cerebro RAG")
// Grafo 2D force-directed estilo Obsidian sobre HTML5 Canvas, sin librerías.
// Nodos = filas de memory_vectors. Enlaces = temas compartidos, similitud
// coseno (umbral ajustable) y clusters padre-hijo. Panel lateral con editor
// inline que regenera el embedding Gemini al guardar.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiGet, apiPost } from '../lib/suriaApi';

// Paleta categórica por `kind` — validada para fondo oscuro (CVD-safe).
const KIND_STYLE = {
  nota:   { core: '#8b5cf6', glow: '#a78bfa', label: 'Nota' },
  minuta: { core: '#059669', glow: '#34d399', label: 'Minuta' },
  alerta: { core: '#ea580c', glow: '#fb923c', label: 'Alerta' },
  evento: { core: '#0284c7', glow: '#38bdf8', label: 'Evento' },
};
const kindStyle = (kind) => KIND_STYLE[kind] || { core: '#64748b', glow: '#94a3b8', label: kind || 'otro' };

const LINK_STYLE = {
  semantic: { name: 'Semánticos', swatch: '#a78bfa' },
  topic:    { name: 'Temas',      swatch: '#22d3ee' },
  parent:   { name: 'Jerarquía',  swatch: '#94a3b8' },
};

const BASE_THRESHOLD = 0.25; // umbral con el que el API precalcula enlaces

// ════════════════════════════════════════════════════════════════════════════
// Motor de física + render (canvas puro, sin React)
// ════════════════════════════════════════════════════════════════════════════
class ForceEngine {
  constructor(canvas, callbacks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cb = callbacks || {};
    this.nodes = [];
    this.links = [];
    this.byId = new Map();
    this.posCache = new Map();
    this.t = { x: 0, y: 0, k: 1 };           // transform pan/zoom
    this.w = 0; this.h = 0; this.dpr = 1;
    this.alpha = 0; this.alphaTarget = 0;
    this.dirty = true;
    this.fitPending = true;
    this.focus = null;                        // Set<id> | null
    this.selectedId = null;
    this.hoverId = null;
    this.sprites = new Map();
    this.pointers = new Map();
    this.dragNode = null;
    this.panning = false;
    this.moved = 0;
    this.destroyed = false;
    this._bind();
    this._raf = requestAnimationFrame(() => this._loop());
  }

  // ── datos ────────────────────────────────────────────────────────────────
  setData(nodes, links, { reheat = 0.6 } = {}) {
    for (const n of this.nodes) this.posCache.set(n.id, { x: n.x, y: n.y });
    const prev = this.posCache;
    this.nodes = nodes.map((n, i) => {
      const p = prev.get(n.id);
      const angle = i * 2.399963, rad = 22 * Math.sqrt(i + 1);
      return {
        ...n,
        x: p ? p.x : Math.cos(angle) * rad,
        y: p ? p.y : Math.sin(angle) * rad,
        vx: 0, vy: 0, fx: null, fy: null,
      };
    });
    this.byId = new Map(this.nodes.map((n) => [n.id, n]));
    this.links = links
      .map((l) => ({ ...l, a: this.byId.get(l.source), b: this.byId.get(l.target) }))
      .filter((l) => l.a && l.b);
    // en grafos densos los resortes se normalizan por grado (como d3-force)
    for (const l of this.links) {
      l.scale = 1 / Math.max(1, Math.sqrt(Math.min(l.a.degree || 1, l.b.degree || 1)));
    }
    const degs = this.nodes.map((n) => n.degree || 0).sort((a, b) => b - a);
    this.hubDeg = Math.max(3, degs[Math.floor(degs.length * 0.08)] || 3);
    this.alphaTarget = 0;
    this.alpha = Math.max(this.alpha, reheat);
    this.dirty = true;
  }

  setFocus(set) { this.focus = set && set.size ? set : null; this.dirty = true; }
  setSelected(id) { this.selectedId = id; this.dirty = true; }

  resize(w, h, dpr) {
    if (w < 40 || h < 40) return; // pestaña oculta
    const first = this.w === 0;
    this.w = w; this.h = h; this.dpr = Math.min(2, dpr || 1);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    if (first) { this.t.x = w / 2; this.t.y = h / 2; }
    this.dirty = true;
  }

  fit() {
    if (!this.nodes.length || !this.w) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of this.nodes) {
      x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y);
      x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y);
    }
    const bw = Math.max(60, x1 - x0), bh = Math.max(60, y1 - y0);
    const k = Math.min(1.6, Math.min((this.w - 90) / bw, (this.h - 90) / bh));
    this.t.k = Math.max(0.08, k);
    this.t.x = this.w / 2 - ((x0 + x1) / 2) * this.t.k;
    this.t.y = this.h / 2 - ((y0 + y1) / 2) * this.t.k;
    this.dirty = true;
  }

  zoomBy(f, cx, cy) {
    const { t } = this;
    const px = cx == null ? this.w / 2 : cx, py = cy == null ? this.h / 2 : cy;
    const wx = (px - t.x) / t.k, wy = (py - t.y) / t.k;
    t.k = Math.max(0.08, Math.min(6, t.k * f));
    t.x = px - wx * t.k; t.y = py - wy * t.k;
    this.dirty = true;
  }

  // ── física ───────────────────────────────────────────────────────────────
  _step() {
    const nodes = this.nodes, links = this.links, alpha = this.alpha;
    // resortes de enlaces
    for (const l of links) {
      const { a, b } = l;
      let dx = b.x - a.x, dy = b.y - a.y;
      let d = Math.sqrt(dx * dx + dy * dy) || 1;
      let rest, k;
      if (l.type === 'parent') { rest = 38; k = 0.14; }
      else if (l.type === 'topic') { rest = 78; k = 0.06; }
      else { rest = 110 - 60 * (l.sim || 0.5); k = 0.03 + 0.08 * (l.sim || 0.5); }
      const f = ((d - rest) / d) * k * (l.scale || 1) * alpha;
      dx *= f; dy *= f;
      if (a.fx == null) { a.vx += dx * 0.5; a.vy += dy * 0.5; }
      if (b.fx == null) { b.vx -= dx * 0.5; b.vy -= dy * 0.5; }
    }
    // repulsión con grilla espacial (radio de corte)
    const R = 290, R2 = R * R, cell = R;
    const grid = new Map();
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const key = (Math.floor(n.x / cell) + 4096) * 8192 + (Math.floor(n.y / cell) + 4096);
      let arr = grid.get(key);
      if (!arr) grid.set(key, (arr = []));
      arr.push(n);
    }
    for (const n of nodes) {
      const cx = Math.floor(n.x / cell), cy = Math.floor(n.y / cell);
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (let gy = cy - 1; gy <= cy + 1; gy++) {
          const arr = grid.get((gx + 4096) * 8192 + (gy + 4096));
          if (!arr) continue;
          for (const m of arr) {
            if (m.id <= n.id) continue; // cada par una sola vez
            let dx = m.x - n.x, dy = m.y - n.y;
            let d2 = dx * dx + dy * dy;
            if (d2 > R2) continue;
            if (d2 < 0.01) { dx = (Math.random() - 0.5); dy = (Math.random() - 0.5); d2 = 0.25; }
            const d = Math.sqrt(d2);
            let f = (1600 * alpha) / Math.max(d2, 64);
            const minD = n.r + m.r + 6;
            if (d < minD) f += ((minD - d) / minD) * 3 * alpha;
            if (f > 8) f = 8;
            const ux = dx / d, uy = dy / d;
            if (n.fx == null) { n.vx -= ux * f; n.vy -= uy * f; }
            if (m.fx == null) { m.vx += ux * f; m.vy += uy * f; }
          }
        }
      }
    }
    // gravedad al centro + integración
    for (const n of nodes) {
      if (n.fx != null) { n.x = n.fx; n.y = n.fy; n.vx = 0; n.vy = 0; continue; }
      n.vx -= n.x * 0.012 * alpha;
      n.vy -= n.y * 0.012 * alpha;
      n.vx *= 0.58; n.vy *= 0.58;
      const sp = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
      if (sp > 14) { n.vx = (n.vx / sp) * 14; n.vy = (n.vy / sp) * 14; }
      n.x += n.vx; n.y += n.vy;
    }
    this.alpha += (this.alphaTarget - this.alpha) * 0.028;
  }

  _loop() {
    if (this.destroyed) return;
    const active = this.alpha > 0.004 || this.alphaTarget > 0;
    if (active && this.nodes.length) {
      this._step();
      // encuadre en dos etapas: uno temprano y otro al estabilizarse
      if (this.fitPending) {
        this._fitTicks = (this._fitTicks || 0) + 1;
        if (this._fitTicks > 60) { this.fit(); this.fitPending = false; this._settleFit = true; }
      } else if (this._settleFit && this.alpha < 0.012) {
        this.fit(); this._settleFit = false;
      }
      this.dirty = true;
    } else if (this.fitPending && this.nodes.length) { this.fit(); this.fitPending = false; }
    if (this.dirty) { this._draw(); this.dirty = false; }
    if (this.cb.onTick) this.cb.onTick(active);
    this._raf = requestAnimationFrame(() => this._loop());
  }

  // ── render ───────────────────────────────────────────────────────────────
  _glowSprite(color) {
    let s = this.sprites.get(color);
    if (s) return s;
    const size = 96, c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
    grad.addColorStop(0, `${color}b8`);
    grad.addColorStop(0.35, `${color}3d`);
    grad.addColorStop(1, `${color}00`);
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    this.sprites.set(color, s = c);
    return s;
  }

  _linkAlpha(l, focusActive) {
    const base = l.type === 'semantic'
      ? 0.10 + 0.32 * Math.max(0, Math.min(1, ((l.sim || 0.5) - 0.25) / 0.7))
      : l.type === 'topic' ? 0.13 : 0.30;
    if (!focusActive) return base;
    const aIn = this._inFocus(l.a.id), bIn = this._inFocus(l.b.id);
    return aIn && bIn ? Math.min(0.85, base * 2.4) : 0.035;
  }

  _inFocus(id) {
    if (this.selectedId) {
      if (id === this.selectedId) return true;
      if (this._neighbors && this._neighbors.has(id)) return true;
      return this.focus ? this.focus.has(id) : false;
    }
    return this.focus ? this.focus.has(id) : true;
  }

  _draw() {
    const { ctx, t, dpr } = this;
    if (!this.w) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const focusActive = !!(this.focus || this.selectedId);
    if (this.selectedId) {
      this._neighbors = new Set();
      for (const l of this.links) {
        if (l.a.id === this.selectedId) this._neighbors.add(l.b.id);
        if (l.b.id === this.selectedId) this._neighbors.add(l.a.id);
      }
    } else this._neighbors = null;

    ctx.setTransform(dpr * t.k, 0, 0, dpr * t.k, dpr * t.x, dpr * t.y);

    // enlaces
    const lw = Math.max(0.6, 1.1 / Math.sqrt(t.k));
    for (const l of this.links) {
      const alpha = this._linkAlpha(l, focusActive);
      if (alpha < 0.01) continue;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = l.type === 'semantic' ? '#a78bfa' : l.type === 'topic' ? '#22d3ee' : '#94a3b8';
      ctx.lineWidth = lw * (l.type === 'topic' ? Math.min(2.2, 0.8 + (l.w || 1) * 0.35) : 1);
      ctx.beginPath();
      ctx.moveTo(l.a.x, l.a.y);
      ctx.lineTo(l.b.x, l.b.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // culling de viewport
    const pad = 80 / t.k;
    const wx0 = (-t.x) / t.k - pad, wy0 = (-t.y) / t.k - pad;
    const wx1 = (this.w - t.x) / t.k + pad, wy1 = (this.h - t.y) / t.k + pad;

    // halos (aditivos = neón)
    ctx.globalCompositeOperation = 'lighter';
    for (const n of this.nodes) {
      if (n.x < wx0 || n.x > wx1 || n.y < wy0 || n.y > wy1) continue;
      const inF = !focusActive || this._inFocus(n.id);
      const hot = n.id === this.selectedId || n.id === this.hoverId;
      ctx.globalAlpha = inF ? (hot ? 0.95 : 0.55) : 0.06;
      const gs = n.r * (hot ? 7 : 5.4);
      ctx.drawImage(this._glowSprite(n.glow), n.x - gs / 2, n.y - gs / 2, gs, gs);
    }
    ctx.globalCompositeOperation = 'source-over';

    // núcleos
    for (const n of this.nodes) {
      if (n.x < wx0 || n.x > wx1 || n.y < wy0 || n.y > wy1) continue;
      const inF = !focusActive || this._inFocus(n.id);
      ctx.globalAlpha = inF ? 1 : 0.14;
      ctx.fillStyle = n.core;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fill();
      if (n.id === this.selectedId || (this.focus && this.focus.has(n.id))) {
        ctx.strokeStyle = 'rgba(238,238,248,0.92)';
        ctx.lineWidth = 1.6 / t.k;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r + 3 / t.k, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // etiquetas (en espacio de pantalla, tamaño constante)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = '10.5px ui-sans-serif, system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    const calm = this.alpha < 0.08; // sin etiquetas masivas mientras la física está caliente
    let visCount = 0;
    for (const n of this.nodes) if (n.x >= wx0 && n.x <= wx1 && n.y >= wy0 && n.y <= wy1) visCount++;
    // densidad: etiquetar todo solo si entran sin amontonarse
    const maxAll = Math.max(12, Math.floor((this.w * this.h) / 26000));
    const showAll = calm && t.k >= 1.35 && visCount <= maxAll;
    const showHubs = calm && t.k >= 0.8;
    const focusSmall = this.focus && this.focus.size <= 50;
    let budget = 240;
    for (const n of this.nodes) {
      if (budget <= 0) break;
      if (n.x < wx0 || n.x > wx1 || n.y < wy0 || n.y > wy1) continue;
      const hot = n.id === this.selectedId || n.id === this.hoverId;
      const inF = !focusActive || this._inFocus(n.id);
      const want = hot || (inF && (showAll || (showHubs && (n.degree || 0) >= this.hubDeg) || (calm && focusSmall && this.focus.has(n.id))));
      if (!want) continue;
      const sx = n.x * t.k + t.x, sy = n.y * t.k + t.y + n.r * t.k + 12;
      ctx.globalAlpha = inF ? (hot ? 1 : 0.78) : 0.2;
      ctx.fillStyle = 'rgba(6,6,12,0.72)';
      const label = n.label;
      const wpx = ctx.measureText(label).width;
      ctx.fillRect(sx - wpx / 2 - 4, sy - 9, wpx + 8, 13);
      ctx.fillStyle = hot ? '#f4f4fa' : '#c9c9dc';
      ctx.fillText(label, sx, sy + 1);
      budget--;
    }
    ctx.globalAlpha = 1;
  }

  // ── interacción ──────────────────────────────────────────────────────────
  pick(sx, sy) {
    const { t } = this;
    const wx = (sx - t.x) / t.k, wy = (sy - t.y) / t.k;
    const slack = 4 / t.k;
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const n = this.nodes[i];
      const dx = wx - n.x, dy = wy - n.y;
      const rr = n.r + slack;
      if (dx * dx + dy * dy <= rr * rr) return n;
    }
    return null;
  }

  _pos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  _bind() {
    const c = this.canvas;
    this._onDown = (e) => {
      c.setPointerCapture && c.setPointerCapture(e.pointerId);
      const p = this._pos(e);
      this.pointers.set(e.pointerId, p);
      if (this.pointers.size > 1) { this.dragNode = null; this.panning = false; return; }
      this.moved = 0;
      this._last = p;
      const n = this.pick(p.x, p.y);
      if (n) {
        this.dragNode = n;
        n.fx = n.x; n.fy = n.y;
        this.alphaTarget = 0.22; this.alpha = Math.max(this.alpha, 0.25);
      } else this.panning = true;
      e.preventDefault();
    };
    this._onMove = (e) => {
      const p = this._pos(e);
      if (this.pointers.has(e.pointerId)) {
        const old = this.pointers.get(e.pointerId);
        this.pointers.set(e.pointerId, p);
        if (this.pointers.size === 2) { // pinch
          const pts = [...this.pointers.values()];
          const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          if (this._pinchD) this.zoomBy(d / this._pinchD, (pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
          this._pinchD = d;
          return;
        }
        const dx = p.x - old.x, dy = p.y - old.y;
        this.moved += Math.abs(dx) + Math.abs(dy);
        if (this.dragNode) {
          const t = this.t;
          this.dragNode.fx = (p.x - t.x) / t.k;
          this.dragNode.fy = (p.y - t.y) / t.k;
          this.dirty = true;
        } else if (this.panning) {
          this.t.x += dx; this.t.y += dy; this.dirty = true;
        }
        return;
      }
      // hover
      const n = this.pick(p.x, p.y);
      if ((n && n.id) !== this.hoverId) {
        this.hoverId = n ? n.id : null;
        this.dirty = true;
        c.style.cursor = n ? 'pointer' : 'grab';
      }
      if (this.cb.onHover) this.cb.onHover(n, p);
    };
    this._onUp = (e) => {
      this.pointers.delete(e.pointerId);
      this._pinchD = null;
      const wasNode = this.dragNode, wasClick = this.moved < 5;
      if (wasNode) { wasNode.fx = null; wasNode.fy = null; this.alphaTarget = 0; }
      this.dragNode = null; this.panning = false;
      if (wasClick && this.cb.onClick) {
        const p = this._pos(e);
        this.cb.onClick(wasNode || this.pick(p.x, p.y));
      }
    };
    this._onWheel = (e) => {
      e.preventDefault();
      const p = this._pos(e);
      this.zoomBy(Math.exp(-e.deltaY * 0.0016), p.x, p.y);
    };
    this._onLeave = () => {
      this.hoverId = null; this.dirty = true;
      if (this.cb.onHover) this.cb.onHover(null, null);
    };
    c.addEventListener('pointerdown', this._onDown);
    c.addEventListener('pointermove', this._onMove);
    c.addEventListener('pointerup', this._onUp);
    c.addEventListener('pointercancel', this._onUp);
    c.addEventListener('pointerleave', this._onLeave);
    c.addEventListener('wheel', this._onWheel, { passive: false });
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this._raf);
    const c = this.canvas;
    c.removeEventListener('pointerdown', this._onDown);
    c.removeEventListener('pointermove', this._onMove);
    c.removeEventListener('pointerup', this._onUp);
    c.removeEventListener('pointercancel', this._onUp);
    c.removeEventListener('pointerleave', this._onLeave);
    c.removeEventListener('wheel', this._onWheel);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Helpers de datos
// ════════════════════════════════════════════════════════════════════════════
const preview = (s, n = 34) => {
  const clean = String(s || '').replace(/\s+/g, ' ').trim();
  return clean.length > n ? `${clean.slice(0, n - 1)}…` : clean || '(sin texto)';
};

const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

// búsqueda sin distinción de tildes ni mayúsculas
const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function buildTopicLinks(memories) {
  const byTopic = new Map();
  for (const m of memories) {
    for (const t of m.topics || []) {
      const key = String(t).toLowerCase();
      if (!byTopic.has(key)) byTopic.set(key, []);
      byTopic.get(key).push(m.memory_id);
    }
  }
  const seen = new Map(); // pairKey → link (acumula peso por temas compartidos)
  for (const ids of byTopic.values()) {
    if (ids.length < 2) continue;
    const addPair = (a, b) => {
      if (seen.size > 6000) return;
      const k = pairKey(a, b);
      const l = seen.get(k);
      if (l) l.w++;
      else seen.set(k, { source: a, target: b, type: 'topic', w: 1 });
    };
    if (ids.length <= 12) {
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) addPair(ids[i], ids[j]);
    } else {
      for (let i = 1; i < ids.length; i++) addPair(ids[0], ids[i]); // estrella: evita la bola de pelo
    }
  }
  return [...seen.values()];
}

// ════════════════════════════════════════════════════════════════════════════
// Componente
// ════════════════════════════════════════════════════════════════════════════
export default function RagGraph() {
  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  const engineRef = useRef(null);

  const [memories, setMemories] = useState(null);   // null = cargando
  const [semLinks, setSemLinks] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [physicsOn, setPhysicsOn] = useState(true);

  const [q, setQ] = useState('');
  const [kindsOff, setKindsOff] = useState(() => new Set());
  const [source, setSource] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sim, setSim] = useState(0.6);
  const [linkTypes, setLinkTypes] = useState({ semantic: true, topic: true, parent: true });

  const [selectedId, setSelectedId] = useState(null);
  const [hover, setHover] = useState(null);

  // editor del panel
  const [draft, setDraft] = useState('');
  const [draftTopics, setDraftTopics] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);
  const [armDelete, setArmDelete] = useState(false);

  // ── carga de datos ───────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoadError(null);
    setMemories(null);
    try {
      const [mems, linksRes] = await Promise.all([
        apiGet('/api/memories'),
        apiGet(`/api/memories/embeddings?links=1&threshold=${BASE_THRESHOLD}&topk=20`).catch(() => ({ links: [] })),
      ]);
      setMemories(Array.isArray(mems) ? mems : []);
      setSemLinks((linksRes && linksRes.links) || []);
    } catch (e) {
      setLoadError(String(e.message || e));
      setMemories([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const refreshSemLinks = useCallback(async () => {
    try {
      const r = await apiGet(`/api/memories/embeddings?links=1&threshold=${BASE_THRESHOLD}&topk=20`);
      setSemLinks((r && r.links) || []);
    } catch (_) { /* se mantienen los enlaces previos */ }
  }, []);

  // ── derivaciones ─────────────────────────────────────────────────────────
  const all = memories || [];
  const byId = useMemo(() => new Map(all.map((m) => [m.memory_id, m])), [all]);

  const kindCounts = useMemo(() => {
    const c = {};
    for (const m of all) c[m.kind || 'nota'] = (c[m.kind || 'nota'] || 0) + 1;
    return c;
  }, [all]);

  const sources = useMemo(() => [...new Set(all.map((m) => m.source).filter(Boolean))].sort(), [all]);

  const topicLinks = useMemo(() => buildTopicLinks(all), [all]);
  const parentLinks = useMemo(
    () => all.filter((m) => m.parent_id && byId.has(m.parent_id) && m.parent_id !== m.memory_id)
      .map((m) => ({ source: m.parent_id, target: m.memory_id, type: 'parent' })),
    [all, byId]
  );

  const visible = useMemo(() => {
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const to = dateTo ? new Date(`${dateTo}T23:59:59`) : null;
    return all.filter((m) => {
      if (kindsOff.has(m.kind || 'nota')) return false;
      if (source !== 'all' && m.source !== source) return false;
      if (from || to) {
        const d = new Date(m.created_at);
        if (Number.isNaN(+d)) return true;
        if (from && d < from) return false;
        if (to && d > to) return false;
      }
      return true;
    });
  }, [all, kindsOff, source, dateFrom, dateTo]);

  const graph = useMemo(() => {
    const idSet = new Set(visible.map((m) => m.memory_id));
    const links = [];
    if (linkTypes.semantic) for (const l of semLinks) {
      if (l.sim >= sim && idSet.has(l.a) && idSet.has(l.b)) links.push({ source: l.a, target: l.b, type: 'semantic', sim: l.sim });
    }
    if (linkTypes.topic) for (const l of topicLinks) if (idSet.has(l.source) && idSet.has(l.target)) links.push(l);
    if (linkTypes.parent) for (const l of parentLinks) if (idSet.has(l.source) && idSet.has(l.target)) links.push(l);

    const degree = new Map();
    for (const l of links) {
      degree.set(l.source, (degree.get(l.source) || 0) + 1);
      degree.set(l.target, (degree.get(l.target) || 0) + 1);
    }
    const nodes = visible.map((m) => {
      const st = kindStyle(m.kind);
      const deg = degree.get(m.memory_id) || 0;
      return {
        id: m.memory_id,
        label: preview(m.content, 26),
        core: st.core, glow: st.glow,
        degree: deg,
        r: 3.2 + Math.min(3.5, (m.content ? m.content.length : 0) / 1200) + Math.min(5.5, 1.15 * Math.sqrt(deg)),
      };
    });
    return { nodes, links };
  }, [visible, semLinks, topicLinks, parentLinks, linkTypes, sim]);

  const matches = useMemo(() => {
    const term = fold(q.trim());
    if (!term) return null;
    const s = new Set();
    for (const m of visible) {
      if (
        fold(m.content).includes(term) ||
        (m.topics || []).some((t) => fold(t).includes(term)) ||
        fold(m.memory_id).includes(term)
      ) s.add(m.memory_id);
    }
    return s;
  }, [q, visible]);

  const selected = selectedId ? byId.get(selectedId) : null;

  // ── motor ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current, stage = stageRef.current;
    if (!canvas || !stage) return undefined;
    const engine = new ForceEngine(canvas, {
      onClick: (n) => { setSelectedId(n ? n.id : null); setHover(null); },
      onHover: (n, p) => setHover(n && p ? { id: n.id, x: p.x, y: p.y } : null),
      onTick: (active) => setPhysicsOn((prev) => (prev === active ? prev : active)),
    });
    engineRef.current = engine;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      engine.resize(r.width, r.height, window.devicePixelRatio);
    });
    ro.observe(stage);
    return () => { ro.disconnect(); engine.destroy(); engineRef.current = null; };
  }, []);

  useEffect(() => {
    if (engineRef.current) engineRef.current.setData(graph.nodes, graph.links, { reheat: 0.5 });
  }, [graph]);

  useEffect(() => { if (engineRef.current) engineRef.current.setFocus(matches); }, [matches]);
  useEffect(() => { if (engineRef.current) engineRef.current.setSelected(selectedId); }, [selectedId]);

  // ── editor ───────────────────────────────────────────────────────────────
  useEffect(() => {
    setSaveMsg(null); setArmDelete(false);
    if (selected) {
      setDraft(selected.content || '');
      setDraftTopics((selected.topics || []).join(', '));
    }
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!selected || saving) return;
    setSaving(true); setSaveMsg(null);
    const topicsArr = draftTopics.split(',').map((s) => s.trim()).filter(Boolean);
    try {
      await apiPost('/api/memories/update', { memory_id: selected.memory_id, content: draft, topics: topicsArr });
      setMemories((ms) => ms.map((m) => (m.memory_id === selected.memory_id ? { ...m, content: draft, topics: topicsArr } : m)));
      setSaveMsg({ ok: true, text: 'Guardado — embedding Gemini regenerado ✓' });
      refreshSemLinks();
    } catch (e) {
      setSaveMsg({ ok: false, text: `No se guardó: ${e.message}` });
    }
    setSaving(false);
  };

  const remove = async () => {
    if (!selected) return;
    if (!armDelete) { setArmDelete(true); return; }
    setSaving(true);
    try {
      await apiPost('/api/memories/delete', { memory_id: selected.memory_id });
      setMemories((ms) => ms.filter((m) => m.memory_id !== selected.memory_id));
      setSelectedId(null);
      refreshSemLinks();
    } catch (e) {
      setSaveMsg({ ok: false, text: `No se borró: ${e.message}` });
    }
    setSaving(false);
    setArmDelete(false);
  };

  const resetFilters = () => {
    setQ(''); setKindsOff(new Set()); setSource('all'); setDateFrom(''); setDateTo('');
    setSim(0.6); setLinkTypes({ semantic: true, topic: true, parent: true });
  };

  const toggleKind = (k) => setKindsOff((prev) => {
    const s = new Set(prev);
    if (s.has(k)) s.delete(k); else s.add(k);
    return s;
  });

  const semCount = graph.links.filter((l) => l.type === 'semantic').length;
  const loading = memories === null;
  const empty = !loading && !loadError && all.length === 0;
  const hoverMem = hover ? byId.get(hover.id) : null;

  // ── UI ───────────────────────────────────────────────────────────────────
  return (
    <div className="rg">
      {/* ── rail de filtros / leyenda ── */}
      <aside className="glass rail">
        <div className="rail-sec">
          <label className="rail-lbl" htmlFor="rg-q">Buscar</label>
          <div className="searchbox">
            <input id="rg-q" type="text" placeholder="palabra clave, tema, ID…" value={q} onChange={(e) => setQ(e.target.value)} />
            {q && <button className="clear" onClick={() => setQ('')} aria-label="limpiar">✕</button>}
          </div>
          {matches && <div className="hint">{matches.size} coincidencia{matches.size === 1 ? '' : 's'} iluminada{matches.size === 1 ? '' : 's'}</div>}
        </div>

        <div className="rail-sec">
          <span className="rail-lbl">Tipo</span>
          <div className="chips">
            {Object.keys(KIND_STYLE).concat(Object.keys(kindCounts).filter((k) => !KIND_STYLE[k])).map((k) => {
              const st = kindStyle(k);
              const off = kindsOff.has(k);
              return (
                <button key={k} className={`chip ${off ? 'off' : ''}`} style={{ '--c': st.core, '--g': st.glow }} onClick={() => toggleKind(k)}>
                  <i /> {st.label} <b>{kindCounts[k] || 0}</b>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rail-sec">
          <label className="rail-lbl" htmlFor="rg-src">Fuente</label>
          <select id="rg-src" value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="all">todas las fuentes</option>
            {sources.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="rail-sec">
          <span className="rail-lbl">Rango de fechas</span>
          <div className="dates">
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="desde" />
            <span>→</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label="hasta" />
          </div>
        </div>

        <div className="rail-sec">
          <label className="rail-lbl" htmlFor="rg-sim">Similitud coseno <b className="simval">≥ {sim.toFixed(2)}</b></label>
          <input id="rg-sim" className="slider" type="range" min={BASE_THRESHOLD} max="0.95" step="0.01" value={sim} onChange={(e) => setSim(Number(e.target.value))} />
          <div className="hint">{semCount} enlace{semCount === 1 ? '' : 's'} semántico{semCount === 1 ? '' : 's'} activo{semCount === 1 ? '' : 's'}</div>
        </div>

        <div className="rail-sec">
          <span className="rail-lbl">Enlaces</span>
          <div className="chips">
            {Object.entries(LINK_STYLE).map(([k, v]) => (
              <button key={k} className={`chip ${linkTypes[k] ? '' : 'off'}`} style={{ '--c': v.swatch, '--g': v.swatch }}
                onClick={() => setLinkTypes((p) => ({ ...p, [k]: !p[k] }))}>
                <i className="line" /> {v.name}
              </button>
            ))}
          </div>
        </div>

        <div className="rail-foot">
          <button className="ghost" onClick={resetFilters}>Reiniciar filtros</button>
          <button className="ghost" onClick={load}>↻ Recargar</button>
        </div>
      </aside>

      {/* ── escenario del grafo ── */}
      <div className={`glass stage ${selected ? 'with-drawer' : ''}`} ref={stageRef}>
        <canvas ref={canvasRef} />
        <div className="hud">
          <span>{graph.nodes.length} nodos · {graph.links.length} enlaces</span>
          <span className={`phys ${physicsOn ? 'on' : ''}`}>{physicsOn ? '⚛ física activa' : '✓ estable'}</span>
        </div>
        <div className="zoomctl">
          <button onClick={() => engineRef.current && engineRef.current.zoomBy(1.35)} aria-label="acercar">+</button>
          <button onClick={() => engineRef.current && engineRef.current.zoomBy(1 / 1.35)} aria-label="alejar">−</button>
          <button onClick={() => engineRef.current && engineRef.current.fit()} aria-label="encuadrar">⌂</button>
        </div>

        {hoverMem && hover && (
          <div className="tip" style={{ left: Math.min(hover.x + 14, 9999), top: hover.y + 14, '--c': kindStyle(hoverMem.kind).core }}>
            <div className="tip-head">
              <span className="tip-kind">{kindStyle(hoverMem.kind).label}</span>
              <span className="tip-date">{hoverMem.created_at ? new Date(hoverMem.created_at).toLocaleDateString('es-AR') : ''}</span>
            </div>
            <div className="tip-body">{preview(hoverMem.content, 110)}</div>
            {(hoverMem.topics || []).length > 0 && <div className="tip-topics">{hoverMem.topics.slice(0, 4).map((t) => `#${t}`).join('  ')}</div>}
          </div>
        )}

        {loading && (
          <div className="overlay"><div className="pulse">🧠</div><p>Cargando el segundo cerebro…</p></div>
        )}
        {loadError && !loading && (
          <div className="overlay">
            <div className="obox">
              <h3>⚠️ Sin conexión con el API</h3>
              <p>{loadError}</p>
              <p className="dim">Verificá que <code>suria-dashboard-api.service</code> esté activo en el puerto 3103.</p>
              <button className="cta" onClick={load}>Reintentar</button>
            </div>
          </div>
        )}
        {empty && (
          <div className="overlay">
            <div className="obox">
              <h3>🧠 El segundo cerebro está vacío</h3>
              <p>Todavía no hay memorias en <code>memory_vectors</code>.</p>
              <p className="dim">Mandale una nota de voz a SURIA por WhatsApp o subí un audio al Minutero: las memorias van a aparecer acá como nodos conectados.</p>
              <button className="cta" onClick={load}>↻ Volver a buscar</button>
            </div>
          </div>
        )}
        {!loading && !empty && !loadError && visible.length === 0 && (
          <div className="overlay soft">
            <div className="obox">
              <h3>Sin resultados con estos filtros</h3>
              <button className="cta" onClick={resetFilters}>Reiniciar filtros</button>
            </div>
          </div>
        )}
      </div>

      {/* ── panel de detalle / editor ── */}
      <div className={`drawer glass ${selected ? 'open' : ''}`} aria-hidden={!selected}>
        {selected && (
          <>
            <div className="d-head" style={{ '--c': kindStyle(selected.kind).core, '--g': kindStyle(selected.kind).glow }}>
              <span className="d-kind">{kindStyle(selected.kind).label}</span>
              <code className="d-id">{selected.memory_id}</code>
              <button className="d-close" onClick={() => setSelectedId(null)} aria-label="cerrar">✕</button>
            </div>

            <div className="d-meta">
              <div><span className="m-lbl">📅 Fecha</span><span>{selected.created_at ? new Date(selected.created_at).toLocaleString('es-AR') : '—'}</span></div>
              <div><span className="m-lbl">📡 Fuente</span><span>{selected.source || '—'}</span></div>
              {selected.ref_id && <div><span className="m-lbl">🔗 Referencia</span><span>{selected.ref_id}</span></div>}
              {selected.parent_id && <div><span className="m-lbl">🧩 Fragmento</span><span>#{selected.chunk_index} de {selected.parent_id}</span></div>}
            </div>

            <label className="d-lbl" htmlFor="d-topics">Temas <span className="dim">(separados por coma)</span></label>
            <input id="d-topics" className="d-input" type="text" value={draftTopics} onChange={(e) => setDraftTopics(e.target.value)} placeholder="corralon, proveedores…" />
            <div className="d-chips">
              {draftTopics.split(',').map((s) => s.trim()).filter(Boolean).map((t, i) => <span key={`${t}-${i}`} className="tchip">#{t}</span>)}
            </div>

            <label className="d-lbl" htmlFor="d-content">Contenido <span className="dim">(corregí la transcripción acá)</span></label>
            <textarea id="d-content" className="d-area" value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck="false" />

            <p className="d-note">Al guardar, el backend recalcula el embedding con Gemini para que las búsquedas RAG sigan siendo precisas.</p>
            {saveMsg && <p className={`d-msg ${saveMsg.ok ? 'ok' : 'err'}`}>{saveMsg.text}</p>}

            <div className="d-actions">
              <button className="save" onClick={save} disabled={saving}>{saving ? '⏳ Procesando…' : '💾 Guardar y re-vectorizar'}</button>
              <button className={`del ${armDelete ? 'armed' : ''}`} onClick={remove} disabled={saving}>
                {armDelete ? '⚠️ ¿Confirmar borrado?' : '🗑 Borrar'}
              </button>
            </div>
          </>
        )}
      </div>

      <style jsx>{`
        .rg { display: grid; grid-template-columns: 252px minmax(0, 1fr); gap: 14px; align-items: start; position: relative; }

        /* rail */
        .rail { padding: 16px 14px; display: flex; flex-direction: column; gap: 16px; position: sticky; top: 86px; }
        .rail-sec { display: flex; flex-direction: column; gap: 7px; }
        .rail-lbl { font-size: 10.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); }
        .rail-lbl b, .simval { color: #c4b5fd; font-variant-numeric: tabular-nums; }
        .hint { font-size: 11px; color: var(--muted); }
        .searchbox { position: relative; }
        .searchbox input { width: 100%; }
        .clear { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--muted); cursor: pointer; font-size: 11px; }
        input[type='text'], select, input[type='date'] {
          background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px;
          color: var(--text); font-size: 12.5px; padding: 7px 9px; outline: none; width: 100%; font-family: inherit;
          color-scheme: dark;
        }
        input[type='text']:focus, select:focus, input[type='date']:focus { border-color: rgba(139, 92, 246, 0.55); box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.14); }
        .dates { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 11px; }

        .chips { display: flex; flex-wrap: wrap; gap: 6px; }
        .chip { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; padding: 5px 10px; border-radius: 999px; cursor: pointer;
          color: var(--text); background: color-mix(in srgb, var(--c) 16%, transparent); border: 1px solid color-mix(in srgb, var(--c) 45%, transparent);
          transition: all 0.18s ease; }
        .chip i { width: 8px; height: 8px; border-radius: 50%; background: var(--g); box-shadow: 0 0 7px var(--g); }
        .chip i.line { width: 14px; height: 2px; border-radius: 2px; }
        .chip b { font-weight: 600; color: var(--muted); font-variant-numeric: tabular-nums; }
        .chip.off { opacity: 0.38; background: transparent; border-color: rgba(255, 255, 255, 0.12); filter: grayscale(0.6); }
        .chip:hover { transform: translateY(-1px); }

        .slider { width: 100%; accent-color: #8b5cf6; }
        .rail-foot { display: flex; gap: 8px; flex-wrap: wrap; border-top: 1px solid rgba(255, 255, 255, 0.07); padding-top: 12px; }
        .ghost { background: none; border: 1px solid rgba(255, 255, 255, 0.14); color: var(--muted); border-radius: 8px; padding: 6px 10px; font-size: 11.5px; cursor: pointer; }
        .ghost:hover { color: var(--text); border-color: rgba(255, 255, 255, 0.3); }

        /* stage */
        .stage { position: relative; overflow: hidden; height: clamp(480px, calc(100vh - 200px), 920px); padding: 0; cursor: grab; }
        .stage canvas { display: block; position: absolute; inset: 0; }
        .hud { position: absolute; top: 12px; left: 14px; display: flex; gap: 10px; align-items: center; font-size: 11px; color: var(--muted);
          background: rgba(8, 8, 14, 0.55); border: 1px solid rgba(255, 255, 255, 0.07); backdrop-filter: blur(8px); padding: 5px 10px; border-radius: 999px; pointer-events: none; font-variant-numeric: tabular-nums; }
        .phys.on { color: #c4b5fd; }
        .phys { color: #34d399; }
        .zoomctl { position: absolute; right: 12px; bottom: 12px; display: flex; flex-direction: column; gap: 5px; }
        .zoomctl button { width: 30px; height: 30px; border-radius: 8px; background: rgba(8, 8, 14, 0.65); color: var(--text); border: 1px solid rgba(255, 255, 255, 0.12); cursor: pointer; font-size: 14px; backdrop-filter: blur(8px); }
        .zoomctl button:hover { border-color: rgba(139, 92, 246, 0.6); color: #c4b5fd; }

        .tip { position: absolute; max-width: 260px; pointer-events: none; z-index: 5; background: rgba(8, 8, 16, 0.92); border: 1px solid color-mix(in srgb, var(--c) 55%, transparent);
          border-radius: 10px; padding: 9px 11px; box-shadow: 0 10px 30px -8px rgba(0, 0, 0, 0.7), 0 0 14px -4px color-mix(in srgb, var(--c) 45%, transparent); }
        .tip-head { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 4px; }
        .tip-kind { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--c); }
        .tip-date { font-size: 10.5px; color: var(--muted); }
        .tip-body { font-size: 12px; line-height: 1.45; color: var(--text); }
        .tip-topics { margin-top: 5px; font-size: 10.5px; color: #22d3ee; }

        .overlay { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; background: rgba(5, 5, 10, 0.55); backdrop-filter: blur(3px); }
        .overlay.soft { background: rgba(5, 5, 10, 0.35); }
        .overlay p { color: var(--muted); font-size: 13px; }
        .pulse { font-size: 44px; animation: brainpulse 1.6s ease-in-out infinite; }
        @keyframes brainpulse { 0%, 100% { transform: scale(1); opacity: 0.75; } 50% { transform: scale(1.16); opacity: 1; } }
        .obox { max-width: 380px; text-align: center; background: rgba(10, 10, 18, 0.8); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 16px; padding: 26px 28px; display: flex; flex-direction: column; gap: 9px; }
        .obox h3 { font-size: 16px; color: var(--text); margin: 0; }
        .obox p { font-size: 12.5px; line-height: 1.55; margin: 0; }
        .obox .dim { opacity: 0.7; }
        .obox code { color: #c4b5fd; font-size: 11.5px; }
        .cta { margin-top: 6px; align-self: center; background: linear-gradient(135deg, #7c3aed, #4f46e5); color: #fff; border: none; border-radius: 10px; padding: 9px 18px; font-size: 12.5px; font-weight: 600; cursor: pointer; box-shadow: 0 6px 22px -6px rgba(124, 58, 237, 0.55); }
        .cta:hover { filter: brightness(1.12); }

        /* drawer */
        .drawer { position: fixed; top: 76px; right: 14px; bottom: 14px; width: min(400px, calc(100vw - 28px)); z-index: 40;
          transform: translateX(calc(100% + 30px)); transition: transform 0.32s cubic-bezier(0.22, 1, 0.36, 1);
          display: flex; flex-direction: column; gap: 10px; padding: 18px; overflow-y: auto; }
        .drawer.open { transform: translateX(0); }
        .d-head { display: flex; align-items: center; gap: 10px; padding-bottom: 10px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); }
        .d-kind { font-size: 10px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: var(--c);
          border: 1px solid color-mix(in srgb, var(--c) 55%, transparent); background: color-mix(in srgb, var(--c) 14%, transparent);
          padding: 4px 9px; border-radius: 999px; text-shadow: 0 0 10px color-mix(in srgb, var(--g) 70%, transparent); }
        .d-id { font-size: 11px; color: var(--muted); flex: 1; overflow: hidden; text-overflow: ellipsis; }
        .d-close { background: none; border: none; color: var(--muted); font-size: 14px; cursor: pointer; padding: 4px; }
        .d-close:hover { color: var(--text); }
        .d-meta { display: flex; flex-direction: column; gap: 5px; font-size: 12px; color: var(--text); }
        .d-meta > div { display: flex; justify-content: space-between; gap: 12px; }
        .m-lbl { color: var(--muted); }
        .d-lbl { font-size: 10.5px; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase; color: var(--muted); margin-top: 6px; }
        .d-lbl .dim { text-transform: none; letter-spacing: 0; font-weight: 400; }
        .d-input { background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; color: var(--text); font-size: 12.5px; padding: 8px 10px; outline: none; font-family: inherit; }
        .d-input:focus { border-color: rgba(139, 92, 246, 0.55); }
        .d-chips { display: flex; flex-wrap: wrap; gap: 5px; }
        .tchip { font-size: 10.5px; color: #67e8f9; background: rgba(34, 211, 238, 0.1); border: 1px solid rgba(34, 211, 238, 0.3); padding: 2px 8px; border-radius: 999px; }
        .d-area { flex: 1; min-height: 170px; resize: vertical; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 10px;
          color: var(--text); font-size: 13px; line-height: 1.6; padding: 11px 12px; outline: none; font-family: inherit; }
        .d-area:focus { border-color: rgba(139, 92, 246, 0.55); box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.12); }
        .d-note { font-size: 11px; color: var(--muted); line-height: 1.5; margin: 0; }
        .d-msg { font-size: 12px; margin: 0; }
        .d-msg.ok { color: #34d399; }
        .d-msg.err { color: #fb7185; }
        .d-actions { display: flex; gap: 9px; margin-top: 2px; }
        .save { flex: 1; background: linear-gradient(135deg, #7c3aed, #4f46e5); color: #fff; border: none; border-radius: 10px; padding: 11px 14px; font-size: 12.5px; font-weight: 700; cursor: pointer; box-shadow: 0 8px 24px -8px rgba(124, 58, 237, 0.6); transition: filter 0.15s; }
        .save:hover:not(:disabled) { filter: brightness(1.13); }
        .save:disabled { opacity: 0.6; cursor: wait; }
        .del { background: rgba(244, 63, 94, 0.1); color: #fb7185; border: 1px solid rgba(244, 63, 94, 0.35); border-radius: 10px; padding: 11px 14px; font-size: 12.5px; font-weight: 600; cursor: pointer; transition: all 0.15s; }
        .del:hover:not(:disabled) { background: rgba(244, 63, 94, 0.2); }
        .del.armed { background: #e11d48; color: #fff; border-color: #e11d48; box-shadow: 0 0 18px -2px rgba(225, 29, 72, 0.6); }

        @media (max-width: 900px) {
          .rg { grid-template-columns: 1fr; }
          .rail { position: static; flex-direction: row; flex-wrap: wrap; align-items: flex-end; }
          .rail-sec { min-width: 150px; flex: 1; }
          .stage { height: clamp(420px, 62vh, 700px); }
          .drawer { top: auto; height: 78vh; }
        }
      `}</style>
    </div>
  );
}
