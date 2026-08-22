/**
 * Punto de entrada del bundle.
 *
 * Sin `StrictMode` a propósito: en desarrollo monta y desmonta cada efecto dos
 * veces, lo que en este caso significa construir la ciudad entera, tirarla y
 * volver a construirla. Los efectos de acá ya limpian correctamente (cada
 * `useEffect` del canvas tiene su `dispose`), así que la doble invocación sólo
 * agregaría ruido y medio segundo de espera en cada recarga.
 */

import { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';

const container = document.getElementById('root');
if (!container) throw new Error('Falta el contenedor #root en index.html');

/**
 * Ruta `/admin`: el Dashboard de Campaña.
 *
 * No hay router porque no hace falta: son dos aplicaciones y una condición. El
 * dashboard se carga aparte (`lazy`) para que el jugador que entra a jugar no
 * baje los gráficos que nunca va a ver, y el `.htaccess` de Hostinger manda
 * cualquier ruta a este mismo `index.html`, así que `/admin` funciona también al
 * recargar.
 */
const AdminApp = lazy(async () => ({ default: (await import('./admin/AdminApp.tsx')).AdminApp }));

const esAdmin = typeof window !== 'undefined' && window.location.pathname.replace(/\/+$/, '').endsWith('/admin');

// El cartel de "Cargando Esquel" vive en el HTML hasta que React monta.
container.innerHTML = '';
createRoot(container).render(
  esAdmin ? (
    <Suspense fallback={<div className="admin-boot">Abriendo el panel…</div>}>
      <AdminApp />
    </Suspense>
  ) : (
    <App />
  ),
);
