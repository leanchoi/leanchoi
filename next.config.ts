import type { NextConfig } from 'next';

/**
 * Cabeceras de seguridad. El sistema maneja datos personales (Ley 25.326): no se
 * sirve en producción sin TLS por delante. Ver HANDOFF.md.
 *
 * La CSP es estricta a propósito: todo lo que la app necesita es propio. No hay
 * CDNs, ni fuentes externas, ni analítica, ni nada de terceros, así que `'self'`
 * alcanza. `'unsafe-inline'` en scripts y estilos es lo que pide Next para
 * hidratar; si algún día se agrega un nonce, se saca de acá.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'geolocation=(self), microphone=(self), camera=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

/**
 * Lo que no va a un buscador: la app de campo, el panel, la consulta del vecino y
 * la API. Lo público del operativo es el cuestionario y los informes, nada más.
 */
const rutasPrivadas = ['/campo/:path*', '/panel/:path*', '/ticket/:path*', '/api/:path*'];

const nextConfig: NextConfig = {
  // Salida autocontenida para la imagen Docker (no requiere node_modules en runtime).
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  // El puerto NUNCA se fija acá: lo define la variable de entorno PORT.
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      ...rutasPrivadas.map((source) => ({
        source,
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      })),
    ];
  },
};

export default nextConfig;
