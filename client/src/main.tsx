/**
 * Punto de entrada del bundle.
 *
 * Sin `StrictMode` a propósito: en desarrollo monta y desmonta cada efecto dos
 * veces, lo que en este caso significa construir la ciudad entera, tirarla y
 * volver a construirla. Los efectos de acá ya limpian correctamente (cada
 * `useEffect` del canvas tiene su `dispose`), así que la doble invocación sólo
 * agregaría ruido y medio segundo de espera en cada recarga.
 */

import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';

const container = document.getElementById('root');
if (!container) throw new Error('Falta el contenedor #root en index.html');

// El cartel de "Cargando Esquel" vive en el HTML hasta que React monta.
container.innerHTML = '';
createRoot(container).render(<App />);
