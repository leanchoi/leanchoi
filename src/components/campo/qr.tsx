'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/**
 * QR del ticket, para que el vecino le saque una foto y se lo lleve.
 * Se genera en el celular: no necesita señal.
 */
export function CodigoQR({ texto, tamanio = 220 }: { texto: string; tamanio?: number }) {
  const [imagen, setImagen] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    QRCode.toDataURL(texto, { width: tamanio, margin: 1, errorCorrectionLevel: 'M' })
      .then((url) => {
        if (vigente) setImagen(url);
      })
      .catch(() => setImagen(null));
    return () => {
      vigente = false;
    };
  }, [texto, tamanio]);

  if (!imagen) {
    return (
      <div
        className="bg-muted flex items-center justify-center rounded-lg"
        style={{ width: tamanio, height: tamanio }}
        aria-hidden
      />
    );
  }
  return (
    // La imagen es un dataURL generado en el propio dispositivo: no pasa por el
    // optimizador de imágenes ni por la red.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={imagen} alt={`Código QR del ticket ${texto}`} width={tamanio} height={tamanio} />
  );
}
