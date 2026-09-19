'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function BotonGenerar() {
  const [slug, setSlug] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  return (
    <div className="mt-4">
      <div className="flex gap-2">
        <input
          type="text"
          value={slug}
          onChange={(evento) => setSlug(evento.target.value)}
          placeholder="slug del barrio (ej: 28-de-junio)"
          className="h-11 flex-1 rounded-lg border bg-transparent px-3 text-sm"
        />
        <Button
          disabled={!slug.trim() || ocupado}
          onClick={async () => {
            setOcupado(true);
            setMensaje(null);
            const respuesta = await fetch(`/api/informes/${slug.trim()}`, { method: 'POST' });
            setOcupado(false);
            if (!respuesta.ok) {
              setMensaje('No se pudo generar: revisá el nombre del barrio.');
              return;
            }
            setMensaje('Informe generado y publicado.');
            window.location.href = `/informes/${slug.trim()}`;
          }}
        >
          {ocupado ? 'Generando…' : 'Generar'}
        </Button>
      </div>
      {mensaje && <p className="text-muted-foreground mt-2 text-sm">{mensaje}</p>}
    </div>
  );
}
