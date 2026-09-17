export interface Coordenadas {
  latitud: number;
  longitud: number;
}

export interface EntradaCheckIn {
  sedeLatitud?: number | null;
  sedeLongitud?: number | null;
  sedeRadioMetros?: number;
  coordenadasDispositivo?: Coordenadas | null;
  precisionMetros?: number | null;
}

export interface ResultadoGeocerca {
  dentroDeGeocerca: boolean | null; // null = permiso denegado o sin señal (Regla R3)
  precisionMetros: number | null;
  // NOTA CRÍTICA (Regla R2): Esta estructura y la entidad RegistroHoras
  // NUNCA contienen latitud ni longitud del estudiante.
}

/**
 * Fórmula de Haversine para calcular distancia en metros entre dos puntos.
 */
function calcularDistanciaMetros(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Radio de la Tierra en metros
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * rad) *
      Math.cos(lat2 * rad) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Evalúa el check-in respetando R2 (sin persistencia de coordenadas del estudiante)
 * y R3 (denegar la ubicación nunca impide cumplir).
 */
export function evaluarGeocerca(entrada: EntradaCheckIn): ResultadoGeocerca {
  const {
    sedeLatitud,
    sedeLongitud,
    sedeRadioMetros = 150,
    coordenadasDispositivo,
    precisionMetros,
  } = entrada;

  // Regla R3: Si el estudiante denegó el permiso o no hay coordenadas
  if (!coordenadasDispositivo || sedeLatitud == null || sedeLongitud == null) {
    return {
      dentroDeGeocerca: null, // Pasa a validación manual sin penalización
      precisionMetros: precisionMetros ?? null,
    };
  }

  const distancia = calcularDistanciaMetros(
    sedeLatitud,
    sedeLongitud,
    coordenadasDispositivo.latitud,
    coordenadasDispositivo.longitud
  );

  const dentro = distancia <= sedeRadioMetros;

  return {
    dentroDeGeocerca: dentro,
    precisionMetros: precisionMetros ?? null,
  };
}