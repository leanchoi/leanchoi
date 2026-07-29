import type { Metadata, Viewport } from 'next';
import './globals.css';
import SessionProvider from '@/components/SessionProvider';
import Footer from '@/components/Footer';
import ActivityTracker from '@/components/ActivityTracker';
import { ToastProvider } from '@/components/Toast';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

const TITLE = 'TROCHI · Gestor de Proyectos Turísticos';
const DESCRIPTION =
  'Tableros, bases y agenda para coordinar proyectos turísticos: listas, tarjetas, tablas, calendario y rankings de equipo.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  applicationName: 'TROCHI',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'TROCHI', statusBarStyle: 'black-translucent' },
  // Sin esto, compartir un link de Trochi mostraba una tarjeta vacía
  openGraph: { title: TITLE, description: DESCRIPTION, siteName: 'TROCHI', type: 'website', locale: 'es_AR' },
  twitter: { card: 'summary', title: TITLE, description: DESCRIPTION },
};

export const viewport: Viewport = {
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
  // Sin maximumScale: bloquear el zoom es una barrera de accesibilidad
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  return (
    <html lang="es">
      <body>
        <SessionProvider session={session}>
          <ToastProvider>
            {children}
            {session && <ActivityTracker />}
            <Footer />
          </ToastProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
