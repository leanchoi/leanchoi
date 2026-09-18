import { createHash } from 'node:crypto';
import type {
  EntradaTranscripcion,
  ResultadoTranscripcion,
  TranscriptionProvider,
  VerificacionProveedor,
} from '../tipos';

/**
 * Proveedor por defecto: determinístico, sin red y sin claves. Permite correr el
 * sistema completo —incluida la purga del audio— en desarrollo, en los tests y en
 * el VPS antes de contratar ningún servicio de desgrabación.
 *
 * El texto que devuelve depende solo del contenido del audio: el mismo archivo
 * produce siempre la misma transcripción.
 */
const FRASES = [
  'La calle está sin luminaria desde la esquina hasta el fondo del pasaje.',
  'Hace tres meses que pedimos que arreglen el desagüe de la vereda.',
  'Los chicos no tienen dónde jugar, la plaza está sin mantenimiento.',
  'Pasa el recolector pero no entra hasta las últimas casas del barrio.',
  'Necesitamos que la sala de salud atienda también por la tarde.',
  'Hay perros sueltos en la cuadra y ya mordieron a un vecino.',
  'El agua llega con poca presión en los meses de verano.',
  'La parada del colectivo quedó lejos desde que cambiaron el recorrido.',
];

export class ProveedorStub implements TranscriptionProvider {
  readonly nombre = 'stub';
  readonly mimesSoportados = ['*'] as const;
  readonly requiereRed = false;

  verificarConfiguracion(): VerificacionProveedor {
    return { ok: true };
  }

  async transcribir(entrada: EntradaTranscripcion): Promise<ResultadoTranscripcion> {
    const hash = createHash('sha256').update(entrada.bytes).digest();
    const cantidad = 1 + ((hash[0] ?? 0) % 3);
    const texto = Array.from({ length: cantidad }, (_, i) => {
      const indice = (hash[i + 1] ?? 0) % FRASES.length;
      return FRASES[indice];
    }).join(' ');

    return {
      texto: `[transcripción de prueba] ${texto}`,
      idioma: entrada.idiomaSugerido ?? 'es-AR',
      proveedor: this.nombre,
      modelo: 'deterministico-v1',
      metadata: { determinista: true, bytes: entrada.bytes.byteLength },
    };
  }
}
