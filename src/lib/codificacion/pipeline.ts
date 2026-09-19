import type { ConfigCodificacion } from './registro';
import type { RepositorioCodificacion } from './repositorio';
import { esCitaTextual } from './tipos';
import type { ClusteringProvider, FragmentoACodificar } from './tipos';

/**
 * El ciclo de la codificación, completo y en un solo lugar.
 *
 *   transcripciones sin codificar  →  agrupar por pregunta  →  VERIFICAR cada cita
 *                                  →  guardar tema + cita  →  auditar
 *
 * El paso que no se saltea nunca es la verificación: una cita que no aparece
 * literalmente en la transcripción se descarta y el tema queda sin cita. Preferimos
 * un informe con menos comillas antes que uno con una frase que el vecino no dijo.
 */

export type DependenciasCodificacion = {
  repo: RepositorioCodificacion;
  proveedor: ClusteringProvider;
  config: ConfigCodificacion;
};

export type ResumenCodificacion = {
  preguntas: number;
  fragmentos: number;
  clusters: number;
  codificaciones: number;
  citasVerificadas: number;
  citasDescartadas: number;
  omitidas: number;
  motivo?: string;
};

const VACIO: ResumenCodificacion = {
  preguntas: 0,
  fragmentos: 0,
  clusters: 0,
  codificaciones: 0,
  citasVerificadas: 0,
  citasDescartadas: 0,
  omitidas: 0,
};

export async function codificarPendientes(
  deps: DependenciasCodificacion,
): Promise<ResumenCodificacion> {
  const { config, proveedor, repo } = deps;

  if (!config.habilitado) {
    return { ...VACIO, motivo: 'FEATURE_CLUSTERING está apagado.' };
  }

  const pendientes = await repo.listarSinCodificar(config.loteProceso);
  if (pendientes.length === 0) {
    return { ...VACIO, motivo: 'No hay transcripciones sin codificar.' };
  }

  const resumen: ResumenCodificacion = { ...VACIO };

  for (const [preguntaId, fragmentos] of agruparPorPregunta(pendientes)) {
    // Con pocos textos no hay temas: hay textos. Se dejan para la próxima corrida.
    if (fragmentos.length < config.minimoFragmentos) {
      resumen.omitidas += fragmentos.length;
      continue;
    }

    const resultado = await proveedor.agrupar({
      preguntaId,
      fragmentos,
      maximoClusters: config.maximoClusters,
    });

    const porId = new Map(fragmentos.map((f) => [f.transcripcionId, f]));
    const filas: Parameters<RepositorioCodificacion['guardar']>[0][number][] = [];

    for (const cluster of resultado.clusters) {
      for (const miembro of cluster.miembros) {
        const fragmento = porId.get(miembro.transcripcionId);
        if (!fragmento) continue;

        const cita = verificarCita(miembro.citaTextual, fragmento.texto);
        if (miembro.citaTextual) {
          if (cita) resumen.citasVerificadas += 1;
          else resumen.citasDescartadas += 1;
        }

        filas.push({
          transcripcionId: fragmento.transcripcionId,
          barrioId: fragmento.barrioId,
          clusterId: cluster.clusterId,
          etiqueta: cluster.etiqueta,
          citaTextual: cita,
          proveedor: resultado.proveedor,
        });
      }
    }

    const guardadas = await repo.guardar(filas);

    resumen.preguntas += 1;
    resumen.fragmentos += fragmentos.length;
    resumen.clusters += resultado.clusters.length;
    resumen.codificaciones += guardadas;

    await repo.registrarAuditoria({
      accion: 'codificacion.pregunta',
      metadata: {
        preguntaId,
        proveedor: resultado.proveedor,
        modelo: resultado.modelo ?? null,
        fragmentos: fragmentos.length,
        clusters: resultado.clusters.length,
        citasVerificadas: resumen.citasVerificadas,
        citasDescartadas: resumen.citasDescartadas,
      },
    });
  }

  return resumen;
}

/**
 * Devuelve la cita solo si es literal. `null` significa "este texto entra en el
 * tema, pero no tenemos una frase que podamos poner entre comillas".
 */
export function verificarCita(cita: string | undefined, transcripcion: string): string | null {
  if (!cita) return null;
  const limpia = cita.trim();
  return esCitaTextual(limpia, transcripcion) ? limpia : null;
}

export function agruparPorPregunta(
  fragmentos: readonly FragmentoACodificar[],
): Map<string, FragmentoACodificar[]> {
  const mapa = new Map<string, FragmentoACodificar[]>();
  for (const fragmento of fragmentos) {
    const lista = mapa.get(fragmento.preguntaId) ?? [];
    lista.push(fragmento);
    mapa.set(fragmento.preguntaId, lista);
  }
  return mapa;
}
