import React from 'react';

// Glifo-umbral: tres marcos anidados abiertos abajo.
export const Glyph = ({ className, stroke = 'currentColor' }) => (
  <svg className={className} viewBox="0 0 100 100" fill="none"
       stroke={stroke} strokeWidth="2.5" strokeLinecap="square" aria-hidden="true">
    <path d="M16 96 L16 16 L84 16 L84 96" />
    <path d="M30 96 L30 30 L70 30 L70 96" />
    <path d="M44 96 L44 44 L56 44 L56 96" />
  </svg>
);

export const LogoLockup = ({ vertical = false }) => (
  <div style={{ display: 'flex', alignItems: 'center', flexDirection: vertical ? 'column' : 'row', gap: vertical ? '14px' : '12px' }}>
    <Glyph className="brand-glyph" stroke="var(--text-primary)" />
    <div style={{ lineHeight: 1.1, textAlign: vertical ? 'center' : 'left' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: '16px', letterSpacing: '0.04em', color: 'var(--text-primary)' }}>BASE SUR</div>
      <div style={{ fontSize: '9px', letterSpacing: '0.42em', color: 'var(--accent)', textTransform: 'uppercase', marginTop: '2px' }}>Containers</div>
    </div>
  </div>
);

// Ilustración de contenedor marítimo (vista lateral, corrugado + puerta).
export const ContainerIllu = ({ className, variant = '40' }) => {
  const short = variant === '20';
  const hc = variant === '40hc';
  const W = short ? 150 : 224;
  const H = hc ? 78 : 62;
  const x = (240 - W) / 2, y = 100 - H - 6;
  const corr = [];
  for (let cx = x + 12; cx < x + W - 44; cx += 11) corr.push(cx);
  const doorX = x + W - 40;
  return (
    <svg className={className} viewBox="0 0 240 100" fill="none" stroke="currentColor"
         strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x={x} y={y} width={W} height={H} rx="2" />
      {corr.map((cx, i) => <line key={i} x1={cx} y1={y + 5} x2={cx} y2={y + H - 5} opacity="0.55" />)}
      {/* puerta */}
      <line x1={doorX} y1={y} x2={doorX} y2={y + H} />
      <line x1={doorX + 13} y1={y + 5} x2={doorX + 13} y2={y + H - 5} opacity="0.55" />
      <line x1={doorX + 26} y1={y + 5} x2={doorX + 26} y2={y + H - 5} opacity="0.55" />
      <line x1={doorX + 6} y1={y + H * 0.32} x2={doorX + 6} y2={y + H * 0.68} />
      {/* castings esquineros */}
      {[[x, y], [x + W - 7, y], [x, y + H - 7], [x + W - 7, y + H - 7]].map(([rx, ry], i) =>
        <rect key={i} x={rx} y={ry} width="7" height="7" />)}
    </svg>
  );
};

// Set de íconos de línea.
export const Icon = ({ name, className }) => {
  const p = { className, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const paths = {
    // usos
    campo: <><path d="M3 21h18" /><path d="M4 21V10l4-3 4 3v11" /><path d="M12 21v-7l4-3 4 3v10" /></>,
    obra: <><path d="M3 21h18" /><path d="M5 21V7l8-4v18" /><path d="M19 21V11l-6-4" /><path d="M9 9v0M9 12v0M9 15v0" /></>,
    comercio: <><path d="M4 9h16l-1-4H5L4 9Z" /><path d="M5 9v11h14V9" /><path d="M10 20v-5h4v5" /></>,
    logistica: <><path d="M3 7h11v9H3z" /><path d="M14 10h4l3 3v3h-7z" /><circle cx="7" cy="18" r="1.6" /><circle cx="17.5" cy="18" r="1.6" /></>,
    almacenamiento: <><path d="M3 8l9-4 9 4v12H3z" /><path d="M7 20v-6h10v6" /><path d="M7 14h10" /></>,
    proyecto: <><rect x="3" y="4" width="18" height="16" rx="1" /><path d="M3 9h18M8 4v5" /><path d="M11 13h6M11 16h4" /></>,
    // por qué
    asesoria: <><path d="M4 5h16v11H9l-4 4V16H4z" /><path d="M8 9h8M8 12h5" /></>,
    claridad: <><circle cx="12" cy="12" r="3" /><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /></>,
    presencia: <><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11Z" /><circle cx="12" cy="10" r="2.4" /></>,
    verificada: <><path d="M12 3l7 3v5c0 4.4-3 8-7 10-4-2-7-5.6-7-10V6l7-3Z" /><path d="m9 12 2 2 4-4" /></>,
    // utilitarios
    ruler: <><path d="M3 8h18v8H3z" /><path d="M7 8v3M11 8v4M15 8v3M19 8v4" /></>,
    truck: <><path d="M3 7h11v9H3z" /><path d="M14 10h4l3 3v3h-7z" /><circle cx="7" cy="18" r="1.6" /><circle cx="17.5" cy="18" r="1.6" /></>,
    instagram: <><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.3" cy="6.7" r="1" fill="currentColor" stroke="none" /></>,
    facebook: <><path d="M14 8h2V5h-2c-2 0-3 1.3-3 3v2H9v3h2v6h3v-6h2.2l.8-3H14v-1.6c0-.6.2-1.4 0 0Z" /></>,
    whatsapp: <><path d="M12 2a10 10 0 0 0-8.5 15.2L2 22l4.9-1.4A10 10 0 1 0 12 2Z" /><path d="M8.5 9c0 4 3 6.5 6.5 6.5.7 0 1.3-.6 1.3-1.3l-1.8-1-1.2 1c-1.4-.6-2.5-1.7-3-3l1-1.2-1-1.8C9.6 8.2 9 8.3 8.5 9Z" fill="currentColor" stroke="none" /></>,
  };
  return <svg {...p}>{paths[name]}</svg>;
};
