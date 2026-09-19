import { getEnv } from '@/lib/env';
import { ProveedorAnthropic } from './proveedores/anthropic';
import { ProveedorStub } from './proveedores/stub';
import type { ClusteringProvider } from './tipos';

/**
 * Fábrica del proveedor de agrupamiento. Agregar uno nuevo son tres pasos:
 *   1. implementar `ClusteringProvider` en `proveedores/`;
 *   2. sumar su nombre al enum `CLUSTERING_PROVIDER` en `src/lib/env.ts`;
 *   3. agregar el `case` acá.
 * Nada más del sistema se entera.
 */
export function crearProveedorClustering(): ClusteringProvider {
  const env = getEnv();

  switch (env.CLUSTERING_PROVIDER) {
    case 'anthropic':
      return new ProveedorAnthropic({
        apiKey: env.ANTHROPIC_API_KEY,
        modelo: env.ANTHROPIC_MODEL,
        timeoutMs: env.CLUSTERING_TIMEOUT_MS,
      });

    case 'stub':
    default:
      return new ProveedorStub();
  }
}

export type ConfigCodificacion = {
  habilitado: boolean;
  proveedor: 'stub' | 'anthropic';
  maximoClusters: number;
  loteProceso: number;
  /** Mínimo de textos para que valga la pena agrupar una pregunta. */
  minimoFragmentos: number;
};

export function getConfigCodificacion(): ConfigCodificacion {
  const env = getEnv();
  return {
    habilitado: env.FEATURE_CLUSTERING,
    proveedor: env.CLUSTERING_PROVIDER,
    maximoClusters: env.CLUSTERING_MAX_TEMAS,
    loteProceso: env.CLUSTERING_LOTE,
    minimoFragmentos: env.CLUSTERING_MINIMO_FRAGMENTOS,
  };
}
