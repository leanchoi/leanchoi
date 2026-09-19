import { TEMA_OTROS, TEMAS } from '../lexico';
import { normalizarParaCotejo } from '../tipos';
import type {
  ClusteringProvider,
  ClusterTematico,
  EntradaClustering,
  FragmentoACodificar,
  MiembroCluster,
  ResultadoClustering,
  VerificacionProveedor,
} from '../tipos';

/**
 * Proveedor por defecto: determinístico, sin red y sin claves. Agrupa por el léxico
 * de `lexico.ts` y recorta la cita de la propia transcripción, así que la cita es
 * literal por construcción.
 *
 * No es tan fino como un modelo, pero alcanza para que el tablero y el informe de
 * barrio funcionen completos en desarrollo, en los tests y en el VPS antes de
 * contratar ningún servicio. Las mismas entradas dan siempre la misma salida.
 */
export class ProveedorStub implements ClusteringProvider {
  readonly nombre = 'stub';
  readonly requiereRed = false;

  verificarConfiguracion(): VerificacionProveedor {
    return { ok: true };
  }

  async agrupar(entrada: EntradaClustering): Promise<ResultadoClustering> {
    const porTema = new Map<string, MiembroCluster[]>();

    for (const fragmento of entrada.fragmentos) {
      const { clusterId, cita } = clasificar(fragmento);
      const miembros = porTema.get(clusterId) ?? [];
      miembros.push({ transcripcionId: fragmento.transcripcionId, citaTextual: cita });
      porTema.set(clusterId, miembros);
    }

    const clusters: ClusterTematico[] = [];
    for (const tema of [...TEMAS, TEMA_OTROS]) {
      const miembros = porTema.get(tema.clusterId);
      if (miembros && miembros.length > 0) {
        clusters.push({ clusterId: tema.clusterId, etiqueta: tema.etiqueta, miembros });
      }
    }

    return {
      clusters: recortar(clusters, entrada.maximoClusters),
      proveedor: this.nombre,
      modelo: 'lexico-v1',
    };
  }
}

/** Corta la transcripción en oraciones literales (son subcadenas del original). */
export function enOraciones(texto: string): string[] {
  return texto
    .split(/(?<=[.;!?])\s+/u)
    .map((oracion) => oracion.trim())
    .filter((oracion) => oracion.length > 0);
}

function clasificar(fragmento: FragmentoACodificar): {
  clusterId: string;
  cita: string | undefined;
} {
  const oraciones = enOraciones(fragmento.texto);
  const normalizadas = oraciones.map(normalizarParaCotejo);

  let mejor: { clusterId: string; puntaje: number; indice: number } | null = null;

  for (const tema of TEMAS) {
    let puntaje = 0;
    let primera = -1;
    normalizadas.forEach((oracion, indice) => {
      const golpes = tema.palabras.filter((palabra) =>
        contienePalabra(oracion, normalizarParaCotejo(palabra)),
      ).length;
      if (golpes > 0) {
        puntaje += golpes;
        if (primera < 0) primera = indice;
      }
    });
    // Empate: gana el tema que aparece antes en el léxico, para que sea estable.
    if (puntaje > 0 && (mejor === null || puntaje > mejor.puntaje)) {
      mejor = { clusterId: tema.clusterId, puntaje, indice: primera };
    }
  }

  const elegido: { clusterId: string; puntaje: number; indice: number } | null = mejor;
  if (elegido === null) {
    return { clusterId: TEMA_OTROS.clusterId, cita: oraciones[0] };
  }
  return { clusterId: elegido.clusterId, cita: oraciones[elegido.indice] ?? oraciones[0] };
}

/** Coincidencia por palabra entera (o frase), no por subcadena: "luz" ≠ "reluciente". */
function contienePalabra(oracion: string, palabra: string): boolean {
  const escapada = palabra.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return new RegExp(`(^|[^a-z0-9ñ])${escapada}([^a-z0-9ñ]|$)`, 'u').test(oracion);
}

/** Deja los temas más poblados y manda el resto a "Otros temas". */
export function recortar(
  clusters: readonly ClusterTematico[],
  maximo: number | undefined,
): ClusterTematico[] {
  if (!maximo || clusters.length <= maximo) return [...clusters];

  const ordenados = [...clusters].sort((a, b) => b.miembros.length - a.miembros.length);
  const quedan = ordenados.slice(0, maximo - 1);
  const sobrantes = ordenados.slice(maximo - 1).flatMap((cluster) => cluster.miembros);
  const otros = quedan.find((cluster) => cluster.clusterId === TEMA_OTROS.clusterId);

  if (otros) {
    return quedan.map((cluster) =>
      cluster.clusterId === TEMA_OTROS.clusterId
        ? { ...cluster, miembros: [...cluster.miembros, ...sobrantes] }
        : cluster,
    );
  }
  return [...quedan, { ...TEMA_OTROS, miembros: sobrantes }];
}
