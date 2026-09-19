import type { Metadata, Viewport } from 'next';
import { RegistrarServiceWorker } from '@/components/campo/registrar-sw';

export const metadata: Metadata = {
  title: 'App de campo',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Relevamiento', statusBarStyle: 'black-translucent' },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#0f172a',
};

/**
 * Todo lo que cuelga de /campo es la app instalable que se usa en la calle.
 * Acá se registra el service worker que la hace abrir sin señal.
 */
export default function LayoutCampo({ children }: { children: React.ReactNode }) {
  return (
    <>
      <RegistrarServiceWorker />
      {children}
    </>
  );
}
