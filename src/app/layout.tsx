import type { Metadata } from 'next'
import './globals.css'
import Providers from '@/components/Providers'

export const metadata: Metadata = {
  title: 'Arrayán Workflows',
  description: 'Bases de datos colaborativas, self-hosted',
  icons: { icon: '/favicon.svg' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body>
        <script
          // aplica el tema guardado antes del primer paint (evita flash)
          dangerouslySetInnerHTML={{
            __html:
              "try{document.documentElement.dataset.theme=localStorage.getItem('arrayan-theme')||'dark'}catch(e){}",
          }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
