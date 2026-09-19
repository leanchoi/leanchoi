/**
 * Service worker de la app de campo.
 *
 * Objetivo único: que la app abra y funcione en un barrio sin señal. Guarda el
 * armazón de la aplicación; los datos del relevamiento NO se guardan acá, viven en
 * IndexedDB.
 *
 * Nunca cachea /api/: las respuestas con datos de vecinos no se guardan en el
 * caché del navegador.
 */
const VERSION = 'rbe-v1';
const CACHE_APP = `${VERSION}-app`;

const ARMAZON = ['/campo', '/manifest.webmanifest', '/icono-192.png', '/icono-512.png'];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE_APP).then((cache) => cache.addAll(ARMAZON).catch(() => undefined)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) =>
        Promise.all(
          claves.filter((clave) => !clave.startsWith(VERSION)).map((clave) => caches.delete(clave)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function conRed(peticion) {
  const cache = await caches.open(CACHE_APP);
  try {
    const respuesta = await fetch(peticion);
    if (respuesta.ok) cache.put(peticion, respuesta.clone());
    return respuesta;
  } catch (error) {
    const guardada = await cache.match(peticion);
    if (guardada) return guardada;
    throw error;
  }
}

async function conCache(peticion) {
  const cache = await caches.open(CACHE_APP);
  const guardada = await cache.match(peticion);
  if (guardada) return guardada;
  const respuesta = await fetch(peticion);
  if (respuesta.ok) cache.put(peticion, respuesta.clone());
  return respuesta;
}

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;
  if (peticion.method !== 'GET') return;

  const url = new URL(peticion.url);
  if (url.origin !== self.location.origin) return;

  // Datos de vecinos: jamás al caché del navegador.
  if (url.pathname.startsWith('/api/')) return;

  // Navegación: primero la red, y si no hay, lo último que se vio.
  if (peticion.mode === 'navigate') {
    evento.respondWith(
      conRed(peticion).catch(async () => {
        const cache = await caches.open(CACHE_APP);
        return (await cache.match('/campo')) ?? Response.error();
      }),
    );
    return;
  }

  // Assets con hash en el nombre: del caché directo.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.endsWith('.png')) {
    evento.respondWith(conCache(peticion));
    return;
  }

  evento.respondWith(conRed(peticion));
});
