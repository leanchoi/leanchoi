// Manifest de PWA: permite "agregar a pantalla de inicio" en el celular, que
// es donde más se usa Trochi en la calle.
export const dynamic = 'force-static';

export function GET() {
  return Response.json({
    name: 'TROCHI · Gestor de Proyectos Turísticos',
    short_name: 'TROCHI',
    description: 'Tableros, bases y agenda para coordinar proyectos turísticos.',
    start_url: '/boards',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#0f172a',
    theme_color: '#0f172a',
    lang: 'es-AR',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  });
}
