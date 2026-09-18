import type { Metadata, Viewport } from 'next';
import './globals.css';
import { APP_VERSION } from '@/lib/version';

export const metadata: Metadata = {
  title: {
    default: 'Relevamiento Barrial — Municipalidad de Esquel',
    template: '%s — Relevamiento Barrial Esquel',
  },
  description:
    'Sistema de relevamiento barrial casa por casa de la Dirección de Juntas Vecinales, Municipalidad de Esquel (Chubut).',
  applicationName: 'Relevamiento Barrial Esquel',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR">
      <body className="min-h-dvh antialiased">
        <div className="flex min-h-dvh flex-col">
          <main className="flex-1">{children}</main>
          <footer className="text-muted-foreground no-imprimir border-t px-4 py-6 text-xs">
            <div className="mx-auto max-w-5xl">
              Municipalidad de Esquel — Dirección de Juntas Vecinales · versión {APP_VERSION}
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
