import type { Metadata } from 'next';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getConfigAudio } from '@/lib/audio/config';
import { Grabador } from './grabador';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Prueba de audio',
  robots: { index: false, follow: false },
};

/**
 * Banco de pruebas del circuito de audio. No es la app de campo (fase 3): sirve
 * para verificar, en el celular real y en el servidor real, que grabar → enviar →
 * desgrabar → borrar funciona de punta a punta.
 */
export default function PaginaAudio() {
  const config = getConfigAudio();

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <header className="mb-8">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Prueba de envío de audio</h1>
          <Badge variant={config.habilitado ? 'default' : 'outline'}>
            {config.habilitado ? 'activo' : 'apagado'}
          </Badge>
        </div>
        <p className="text-muted-foreground mt-3 text-sm">
          Las preguntas abiertas se contestan por voz. El audio es temporal: se guarda solo hasta
          que la desgrabación queda asegurada y después se borra del sistema. Tope duro:{' '}
          {config.ttlHoras} horas.
        </p>
      </header>

      {config.habilitado ? (
        <Card>
          <CardHeader>
            <CardTitle>Grabar y enviar</CardTitle>
            <CardDescription>
              Proveedor de desgrabación configurado: <code>{config.proveedor}</code>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Grabador preguntaId="prueba-audio" />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Módulo apagado</CardTitle>
            <CardDescription>
              El sistema funciona completo sin audio. Para probarlo, poné{' '}
              <code>FEATURE_AUDIO=true</code> en el <code>.env</code> y reiniciá la aplicación.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
