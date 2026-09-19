'use client';

import { useEffect } from 'react';

/**
 * Registra el service worker que hace que la app abra sin señal.
 * Solo se monta dentro de /campo: el resto del sistema no necesita PWA.
 */
export function RegistrarServiceWorker() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    if (
      window.location.protocol !== 'https:' &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1'
    ) {
      return;
    }
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Sin service worker la app sigue andando; solo pierde el arranque offline.
    });
  }, []);

  return null;
}
