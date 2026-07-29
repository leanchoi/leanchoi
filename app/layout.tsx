import type { Metadata, Viewport } from 'next';
import './globals.css';
import SessionProvider from '@/components/SessionProvider';
import Footer from '@/components/Footer';
import ActivityTracker from '@/components/ActivityTracker';
import { ToastProvider } from '@/components/Toast';
import PasswordGate from '@/components/PasswordGate';
import DailyDigest from '@/components/DailyDigest';
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
  themeColor: '#0b111d',
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
            <Footer />
            {/* Estos tres deciden por su cuenta con useSession(). Antes iban
                condicionados a la sesión del servidor, que queda obsoleta
                cuando el usuario entra desde /login y navega sin recargar: el
                layout no se vuelve a renderizar, así que nunca aparecían hasta
                la siguiente recarga completa.

                El orden importa: PasswordGate bloquea todo hasta que se cambie
                la contraseña, y DailyDigest espera su turno detrás. */}
            <ActivityTracker />
            <PasswordGate />
            <DailyDigest />
          </ToastProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
