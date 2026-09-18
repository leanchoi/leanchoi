import { AlmacenamientoEnDisco } from './almacenamiento';
import { getConfigAudio } from './config';
import type { DependenciasAudio } from './pipeline';
import { crearProveedorTranscripcion } from './registro';
import { RepositorioAudiosDrizzle } from './repositorio';

/** Cableado real del módulo de audio (base, disco y proveedor configurado). */
export function crearDependenciasAudio(): DependenciasAudio {
  const config = getConfigAudio();
  return {
    repo: new RepositorioAudiosDrizzle(),
    almacen: new AlmacenamientoEnDisco(config.directorio),
    proveedor: crearProveedorTranscripcion(),
    config,
  };
}

/** Compara el token del worker en tiempo constante. */
export function tokenWorkerValido(recibido: string | null, esperado: string | undefined): boolean {
  if (!esperado || !recibido) return false;
  if (recibido.length !== esperado.length) return false;
  let diferencia = 0;
  for (let i = 0; i < esperado.length; i += 1) {
    diferencia |= recibido.charCodeAt(i) ^ esperado.charCodeAt(i);
  }
  return diferencia === 0;
}
