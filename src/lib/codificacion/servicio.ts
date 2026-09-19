import type { DependenciasCodificacion } from './pipeline';
import { crearProveedorClustering, getConfigCodificacion } from './registro';
import { RepositorioCodificacionDrizzle } from './repositorio';

/** Cableado real del módulo de codificación (base y proveedor configurado). */
export function crearDependenciasCodificacion(): DependenciasCodificacion {
  return {
    repo: new RepositorioCodificacionDrizzle(),
    proveedor: crearProveedorClustering(),
    config: getConfigCodificacion(),
  };
}
