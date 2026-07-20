// SURIA — Centro de Control Unificado (pestaña "Aplicaciones")
// Diales de hardware del VPS, mapa de aplicaciones con estado en vivo
// y contadores de uso de Gemini. Se refresca solo cada 15 s.
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet } from '../lib/suriaApi';

const VPS_IP = '187.77.224.159';

// Catálogo de aplicaciones del VPS. statusKey ↔ SERVICES del dashboard_api.js
const APPS = [
  { key: 'suria', icon: '🤖', accent: '#059669', name: 'SURIA WhatsApp Co-pilot', desc: 'Co-piloto conversacional con memoria RAG sobre WhatsApp (Baileys).', statusKey: 'whatsapp', port: 3100, linkKey: 'whatsapp', href: 'https://web.whatsapp.com' },
  { key: 'minutero', icon: '🎙️', accent: '#8b5cf6', name: 'Minutero de Reuniones', desc: 'Subida de audios largos, transcripción y minutas automáticas.', statusKey: 'minuter', port: 3102, linkKey: 'minutero', href: '/minutero/' },
  { key: 'trochi', icon: '🗂️', accent: '#0284c7', name: 'Base Trochi (NocoDB)', desc: 'NocoDB sobre suria.db: memorias, contactos y tablas operativas.', statusKey: 'nocodb-trochi', port: 8080, href: `http://${VPS_IP}:8080` },
  { key: 'observatorio', icon: '🔭', accent: '#0284c7', name: 'Observatorio Turístico', desc: 'NocoDB sobre PostgreSQL observatorio_turistico.', statusKey: 'nocodb-observatorio', port: 8082, href: `http://${VPS_IP}:8082` },
  { key: 'metrica', icon: '📈', accent: '#ea580c', name: 'Métrica Inmobiliaria', desc: 'Scraper y analítica de inmuebles comerciales.', statusKey: 'metrica', port: 3013, href: `http://${VPS_IP}:3013` },
  { key: 'andar', icon: '🏠', accent: '#ea580c', name: 'Andar Alquileres', desc: 'Plataforma de alquileres inmobiliarios.', statusKey: 'andar', port: 3015, href: `http://${VPS_IP}:3015` },
  { key: 'bofi', icon: '📄', accent: '#8b5cf6', name: 'Procesador de PDFs Bofi', desc: 'Parser y extractor de documentos PDF.', statusKey: 'bofi', port: 18777, href: `http://${VPS_IP}:18777` },
  { key: 'rojas', icon: '🏗️', accent: '#eab308', name: 'Rojas Construcciones', desc: 'Sitio y API de Rojas Construcciones (API en :8181).', statusKey: 'rojas-web', port: 8180, href: `http://${VPS_IP}:8180` },
  { key: 'basesur', icon: '🌐', accent: '#64748b', name: 'Web basesur', desc: 'Sitio estático servido por nginx.', statusKey: 'basesur', port: 8090, href: `http://${VPS_IP}:8090` },
  { key: 'n8n', icon: '⚙️', accent: '#e11d48', name: 'Automatizaciones n8n', desc: 'Workflows de automatización e integraciones.', statusKey: 'n8n', port: 5678, href: 'https://n8n.colabtur.org' },
];

const fmtInt = (n) => (n == null ? '—' : Math.round(n).toLocaleString('es-AR'));
const fmtCompact = (n) => {
  if (n == null) return '—';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} k`;
  return String(Math.round(n));
};
const fmtGb = (mbOrGb, isMb) => {
  const gb = isMb ? mbOrGb / 1024 : mbOrGb;
  return `${gb >= 100 ? Math.round(gb) : gb.toFixed(1)} GB`;
};
const fmtUptime = (sec) => {
  if (!sec) return '—';
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  return d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m`;
};

// Color de severidad para los diales (con el % siempre visible al lado)
const gaugeColor = (pct) => (pct < 60 ? '#22d3ee' : pct < 85 ? '#f59e0b' : '#f43f5e');

function Gauge({ id, label, pct, main, sub }) {
  const clamped = Math.max(0, Math.min(100, pct || 0));
  const R = 52, C = 2 * Math.PI * R, ARC = C * 0.75; // arco de 270°
  const off = ARC * (1 - clamped / 100);
  const color = gaugeColor(clamped);
  return (
    <div className="gauge" role="img" aria-label={`${label}: ${Math.round(clamped)}%`}>
      <svg viewBox="0 0 130 130" width="150" height="150">
        <defs>
          <linearGradient id={`gg-${id}`} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor={color} stopOpacity="0.55" />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
        </defs>
        <g transform="rotate(135 65 65)">
          <circle cx="65" cy="65" r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${ARC} ${C}`} />
          <circle cx="65" cy="65" r={R} fill="none" stroke={`url(#gg-${id})`} strokeWidth="9" strokeLinecap="round"
            strokeDasharray={`${ARC} ${C}`} strokeDashoffset={off}
            style={{ transition: 'stroke-dashoffset 1s cubic-bezier(.22,1,.36,1), stroke .6s', filter: `drop-shadow(0 0 7px ${color}66)` }} />
        </g>
        <text x="65" y="62" textAnchor="middle" className="gauge-pct" fill="#eef" >{pct == null ? '—' : `${Math.round(clamped)}%`}</text>
        <text x="65" y="80" textAnchor="middle" className="gauge-main" fill="#9b9bb0">{main}</text>
      </svg>
      <div className="gauge-label">{label}</div>
      <div className="gauge-sub">{sub}</div>
      <style jsx>{`
        .gauge { display: flex; flex-direction: column; align-items: center; gap: 2px; }
        .gauge :global(.gauge-pct) { font-size: 24px; font-weight: 700; font-variant-numeric: tabular-nums; }
        .gauge :global(.gauge-main) { font-size: 9.5px; }
        .gauge-label { font-size: 13px; font-weight: 600; color: var(--text); letter-spacing: 0.02em; }
        .gauge-sub { font-size: 11.5px; color: var(--muted); font-variant-numeric: tabular-nums; }
      `}</style>
    </div>
  );
}

function StatusPill({ svc }) {
  const state = svc == null ? 'unknown' : svc.online ? 'online' : 'offline';
  const txt = state === 'online' ? 'EN LÍNEA' : state === 'offline' ? 'OFFLINE' : '· · ·';
  return (
    <span className={`pill ${state}`} title={svc && svc.online ? `respondió en ${svc.ms} ms` : 'sin respuesta en el puerto local'}>
      <i />{txt}
      <style jsx>{`
        .pill { display: inline-flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 700; letter-spacing: 0.09em; padding: 4px 9px; border-radius: 999px; border: 1px solid; font-variant-numeric: tabular-nums; }
        .pill i { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
        .online { color: #34d399; border-color: rgba(52, 211, 153, 0.35); background: rgba(5, 150, 105, 0.12); text-shadow: 0 0 8px rgba(52, 211, 153, 0.6); }
        .online i { background: #34d399; box-shadow: 0 0 8px #34d399; animation: pulse 2.2s ease-in-out infinite; }
        .offline { color: #fb7185; border-color: rgba(251, 113, 133, 0.35); background: rgba(244, 63, 94, 0.10); }
        .offline i { background: #fb7185; box-shadow: 0 0 6px #fb7185; }
        .unknown { color: var(--muted); border-color: rgba(255, 255, 255, 0.12); background: rgba(255, 255, 255, 0.04); }
        .unknown i { background: var(--muted); }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
      `}</style>
    </span>
  );
}

export default function ControlCenter() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const timer = useRef(null);

  const load = useCallback(async () => {
    try {
      const s = await apiGet('/api/system/stats');
      setStats(s);
      setError(null);
      setUpdatedAt(new Date());
    } catch (e) {
      setError(String(e.message || e));
    }
  }, []);

  useEffect(() => {
    load();
    timer.current = setInterval(() => { if (!document.hidden) load(); }, 15000);
    return () => clearInterval(timer.current);
  }, [load]);

  const svcMap = {};
  if (stats && Array.isArray(stats.services)) for (const s of stats.services) svcMap[s.id] = s;

  const ram = stats && stats.ram;
  const disk = stats && stats.disk;
  const hostInfo = stats && stats.host;
  const gem = stats && stats.gemini && !stats.gemini.error ? stats.gemini : null;
  const ramPct = ram && ram.totalMb ? (ram.usedMb / ram.totalMb) * 100 : null;
  const diskPct = disk && disk.totalGb ? (disk.usedGb / disk.totalGb) * 100 : null;
  const cpuPct = hostInfo && hostInfo.cpus ? Math.min(100, (hostInfo.load[0] / hostInfo.cpus) * 100) : null;

  const appHref = (app) => {
    if (app.linkKey && stats && stats.links && stats.links[app.linkKey]) return stats.links[app.linkKey];
    return app.href;
  };

  return (
    <div className="cc">
      {error && (
        <div className="glass errbox">
          <span>⚠️ No se pudo conectar con el API del dashboard: <b>{error}</b></span>
          <button className="btn" onClick={load}>Reintentar</button>
        </div>
      )}

      {/* ── Hardware del VPS ─────────────────────────────────────────── */}
      <section>
        <div className="sec-head">
          <h2>Estado del VPS</h2>
          <span className="sec-sub">
            {hostInfo ? `${hostInfo.hostname} · ${VPS_IP} · activo hace ${fmtUptime(hostInfo.uptimeSec)}` : `${VPS_IP}`}
            {updatedAt && <em> · actualizado {updatedAt.toLocaleTimeString('es-AR')}</em>}
          </span>
        </div>
        <div className="glass gauges">
          <Gauge id="ram" label="Memoria RAM" pct={ramPct}
            main={ram ? `${fmtGb(ram.usedMb, true)} / ${fmtGb(ram.totalMb, true)}` : '· · ·'}
            sub={ram ? `${fmtGb(ram.availableMb, true)} disponibles` : 'esperando datos'} />
          <Gauge id="disk" label="Disco  /" pct={diskPct}
            main={disk ? `${fmtGb(disk.usedGb)} / ${fmtGb(disk.totalGb)}` : '· · ·'}
            sub={disk ? `${fmtGb(disk.freeGb)} libres` : 'esperando datos'} />
          <Gauge id="cpu" label="Carga CPU" pct={cpuPct}
            main={hostInfo ? `load ${hostInfo.load[0].toFixed(2)}` : '· · ·'}
            sub={hostInfo ? `${hostInfo.load.map((l) => l.toFixed(2)).join(' · ')} — ${hostInfo.cpus} núcleos` : 'promedios 1/5/15 min'} />
        </div>
      </section>

      {/* ── Estadísticas Gemini ──────────────────────────────────────── */}
      <section>
        <div className="sec-head">
          <h2>Estadísticas de Gemini</h2>
          <span className="sec-sub">uso estimado del segundo cerebro{gem && gem.lastMemoryAt ? ` · última memoria ${new Date(gem.lastMemoryAt).toLocaleString('es-AR')}` : ''}</span>
        </div>
        <div className="tiles">
          {[
            { icon: '🧠', label: 'Memorias totales', val: gem ? fmtInt(gem.memories) : '—' },
            { icon: '📋', label: 'Minutas', val: gem ? fmtInt(gem.byKind && gem.byKind.minuta) || '0' : '—' },
            { icon: '🚨', label: 'Alertas', val: gem ? fmtInt(gem.byKind && gem.byKind.alerta) || '0' : '—' },
            { icon: '🎙️', label: 'Sesiones minutero', val: gem ? fmtInt(gem.minuterSessions) : '—' },
            { icon: '🔤', label: 'Tokens estimados', val: gem ? `≈ ${fmtCompact(gem.estTokens)}` : '—', hint: '~4 caracteres por token' },
            { icon: '🧬', label: 'Embeddings generados', val: gem ? fmtInt(gem.embeddingCalls) : '—' },
          ].map((t) => (
            <div className="glass tile" key={t.label} title={t.hint || ''}>
              <span className="tile-ico">{t.icon}</span>
              <span className="tile-val">{t.val == null ? '0' : t.val}</span>
              <span className="tile-lbl">{t.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Mapa de aplicaciones ─────────────────────────────────────── */}
      <section>
        <div className="sec-head">
          <h2>Aplicaciones</h2>
          <span className="sec-sub">{Object.keys(svcMap).length ? `${Object.values(svcMap).filter((s) => s.online).length} de ${Object.keys(svcMap).length} servicios en línea` : 'chequeando servicios…'}</span>
        </div>
        <div className="grid">
          {APPS.map((app) => (
            <a className="glass card" key={app.key} href={appHref(app)} target="_blank" rel="noreferrer"
              style={{ '--accent': app.accent }}>
              <div className="card-top">
                <span className="card-ico">{app.icon}</span>
                <StatusPill svc={svcMap[app.statusKey]} />
              </div>
              <div className="card-name">{app.name}</div>
              <div className="card-desc">{app.desc}</div>
              <div className="card-foot">
                <span className="port">:{app.port}</span>
                <span className="open">Abrir ↗</span>
              </div>
            </a>
          ))}
        </div>
      </section>

      <style jsx>{`
        .cc { display: flex; flex-direction: column; gap: 34px; }
        section { display: flex; flex-direction: column; gap: 14px; }
        .sec-head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
        h2 { font-size: 17px; font-weight: 700; letter-spacing: 0.01em; margin: 0; color: var(--text); }
        .sec-sub { font-size: 12px; color: var(--muted); }
        .sec-sub em { font-style: normal; opacity: 0.75; }
        .errbox { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 14px 18px; border-color: rgba(244, 63, 94, 0.35); color: #fda4af; font-size: 13px; flex-wrap: wrap; }
        .btn { background: rgba(244, 63, 94, 0.15); color: #fda4af; border: 1px solid rgba(244, 63, 94, 0.4); border-radius: 8px; padding: 6px 14px; font-size: 12px; cursor: pointer; }
        .btn:hover { background: rgba(244, 63, 94, 0.28); }

        .gauges { display: flex; justify-content: space-around; flex-wrap: wrap; gap: 18px; padding: 22px 16px; }

        .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
        .tile { display: flex; flex-direction: column; gap: 3px; padding: 14px 16px; }
        .tile-ico { font-size: 15px; opacity: 0.9; }
        .tile-val { font-size: 24px; font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
        .tile-lbl { font-size: 11.5px; color: var(--muted); }

        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 14px; }
        .card { display: flex; flex-direction: column; gap: 8px; padding: 18px; text-decoration: none; color: inherit; position: relative; overflow: hidden; transition: transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease; }
        .card::before { content: ''; position: absolute; inset: 0 0 auto 0; height: 2px; background: linear-gradient(90deg, transparent, var(--accent), transparent); opacity: 0.55; }
        .card:hover { transform: translateY(-3px); border-color: color-mix(in srgb, var(--accent) 55%, transparent); box-shadow: 0 12px 34px -12px color-mix(in srgb, var(--accent) 45%, transparent), 0 0 0 1px color-mix(in srgb, var(--accent) 25%, transparent) inset; }
        .card-top { display: flex; align-items: center; justify-content: space-between; }
        .card-ico { font-size: 26px; filter: drop-shadow(0 0 10px color-mix(in srgb, var(--accent) 60%, transparent)); }
        .card-name { font-size: 15px; font-weight: 700; color: var(--text); }
        .card-desc { font-size: 12px; line-height: 1.5; color: var(--muted); flex: 1; }
        .card-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 4px; }
        .port { font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 6px; padding: 2px 7px; }
        .open { font-size: 12px; font-weight: 600; color: color-mix(in srgb, var(--accent) 80%, #fff); opacity: 0; transform: translateX(-4px); transition: all 0.22s ease; }
        .card:hover .open { opacity: 1; transform: translateX(0); }

        @media (max-width: 640px) {
          .gauges { padding: 14px 6px; }
          .grid { grid-template-columns: 1fr 1fr; }
        }
        @media (max-width: 460px) { .grid { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}
