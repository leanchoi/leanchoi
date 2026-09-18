import type { NextConfig } from 'next';

/**
 * Cabeceras mínimas de seguridad. El sistema maneja datos personales
 * (Ley 25.326): no se sirve en producción sin TLS por delante. Ver HANDOFF.md.
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'geolocation=(self), microphone=(self), camera=()' },
];

const nextConfig: NextConfig = {
  // Salida autocontenida para la imagen Docker (no requiere node_modules en runtime).
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  // El puerto NUNCA se fija acá: lo define la variable de entorno PORT.
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
