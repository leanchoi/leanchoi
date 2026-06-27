import React from 'react';

// Glifo-umbral: tres marcos anidados abiertos abajo (el "portal / marco para el paisaje").
export const Glyph = ({ className, stroke = 'currentColor' }) => (
  <svg className={className} viewBox="0 0 100 100" fill="none"
       stroke={stroke} strokeWidth="2.5" strokeLinecap="square" aria-hidden="true">
    <path d="M16 96 L16 16 L84 16 L84 96" />
    <path d="M30 96 L30 30 L70 30 L70 96" />
    <path d="M44 96 L44 44 L56 44 L56 96" />
  </svg>
);

// Lockup horizontal para el nav: glifo + wordmark.
export const LogoLockup = ({ vertical = false }) => (
  <div style={{
    display: 'flex', alignItems: 'center',
    flexDirection: vertical ? 'column' : 'row',
    gap: vertical ? '14px' : '12px',
  }}>
    <Glyph className="brand-glyph" stroke="var(--text-primary)" />
    <div style={{ lineHeight: 1.1, textAlign: vertical ? 'center' : 'left' }}>
      <div style={{
        fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: '16px',
        letterSpacing: '0.04em', color: 'var(--text-primary)',
      }}>BASE SUR</div>
      <div style={{
        fontSize: '9px', letterSpacing: '0.42em', color: 'var(--accent)',
        textTransform: 'uppercase', marginTop: '2px',
      }}>Containers</div>
    </div>
  </div>
);

// Íconos de línea para las soluciones (grúa, montaña, planta, casa).
export const Icon = ({ name, className }) => {
  const common = { className, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const paths = {
    obra: <><path d="M3 21h18" /><path d="M5 21V7l8-4v18" /><path d="M19 21V11l-6-4" /><path d="M9 9v0M9 12v0M9 15v0" /></>,
    turismo: <><path d="M3 21h18" /><path d="M5 21V8l7-5 7 5v13" /><path d="M9 21v-6h6v6" /></>,
    campo: <><path d="M3 21h18" /><path d="M4 21V10l4-3 4 3v11" /><path d="M12 21v-7l4-3 4 3v10" /></>,
    vivienda: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-6h4v6" /></>,
    termico: <><path d="M12 2v20" /><path d="M5 7c2 1 5 1 7 0s5-1 7 0" /><path d="M5 12c2 1 5 1 7 0s5-1 7 0" /><path d="M5 17c2 1 5 1 7 0s5-1 7 0" /></>,
    estructura: <><rect x="4" y="4" width="16" height="16" /><path d="M4 4l16 16M20 4L4 20" /></>,
    precision: <><circle cx="12" cy="12" r="9" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /><circle cx="12" cy="12" r="2.5" /></>,
    eco: <><path d="M12 21c5-2 8-6 8-11a8 8 0 0 0-8-8 8 8 0 0 0-8 8c0 5 3 9 8 11Z" /><path d="M12 12c0-3 2-5 4-6" /></>,
    whatsapp: <><path d="M12 2a10 10 0 0 0-8.5 15.2L2 22l4.9-1.4A10 10 0 1 0 12 2Z" /><path d="M8.5 9c0 4 3 6.5 6.5 6.5.7 0 1.3-.6 1.3-1.3l-1.8-1-1.2 1c-1.4-.6-2.5-1.7-3-3l1-1.2-1-1.8C9.6 8.2 9 8.3 8.5 9Z" fill="currentColor" stroke="none" /></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
};
