import type { Ubicacion } from './tipos';

/**
 * Posición del encuestador.
 *
 * Es DATO, no validación: nunca se pierde ni se demora una carga por el GPS. Por eso
 * no se pide la posición en el momento de abrir o cerrar la encuesta —eso haría
 * esperar al encuestador parado en la vereda—, sino que se sigue en segundo plano y
 * se usa la última conocida.
 */

let ultima: Ubicacion = null;
let observador: number | null = null;

function desdePosicion(posicion: GeolocationPosition): Ubicacion {
  return {
    lat: posicion.coords.latitude,
    lng: posicion.coords.longitude,
    precisionM: posicion.coords.accuracy,
    tomadaEn: new Date().toISOString(),
  };
}

/** Arranca el seguimiento. Si el navegador no puede o el vecino no da permiso, no pasa nada. */
export function iniciarSeguimiento(): void {
  if (typeof navigator === 'undefined' || !navigator.geolocation || observador !== null) return;
  try {
    observador = navigator.geolocation.watchPosition(
      (posicion) => {
        ultima = desdePosicion(posicion);
      },
      () => {
        // Sin permiso o sin señal de GPS: se sigue trabajando sin coordenadas.
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  } catch {
    observador = null;
  }
}

export function detenerSeguimiento(): void {
  if (observador !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
    navigator.geolocation.clearWatch(observador);
  }
  observador = null;
}

/** La última posición conocida. Inmediata: no espera al GPS. */
export function ultimaUbicacion(): Ubicacion {
  return ultima;
}

/** Solo para usos puntuales fuera del relevamiento (banco de pruebas). */
export async function tomarUbicacion(opciones?: { timeoutMs?: number }): Promise<Ubicacion> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null;

  return new Promise<Ubicacion>((resolver) => {
    let resuelto = false;
    const terminar = (valor: Ubicacion) => {
      if (resuelto) return;
      resuelto = true;
      resolver(valor);
    };
    const timeoutMs = opciones?.timeoutMs ?? 8000;
    setTimeout(() => terminar(ultima), timeoutMs + 500);

    navigator.geolocation.getCurrentPosition(
      (posicion) => {
        ultima = desdePosicion(posicion);
        terminar(ultima);
      },
      () => terminar(ultima),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    );
  });
}
