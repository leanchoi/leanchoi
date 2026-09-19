import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { TEMA_OTROS, TEMAS } from '../lexico';
import { ErrorClustering } from '../tipos';
import type {
  ClusteringProvider,
  ClusterTematico,
  EntradaClustering,
  MiembroCluster,
  ResultadoClustering,
  VerificacionProveedor,
} from '../tipos';

/**
 * Agrupamiento temático con la API de Anthropic.
 *
 * Tres decisiones que conviene no tocar sin pensarlas:
 *
 *  - **Se manda solo texto y un identificador corto.** Ni ticket, ni vivienda, ni
 *    barrio, ni nada que venga del esquema `identificada`.
 *  - **La respuesta viene con formato forzado** (`output_config.format`), así que se
 *    parsea sin heurísticas ni expresiones regulares sobre prosa.
 *  - **La cita la verifica el pipeline, no el modelo.** Acá solo se pide que copie
 *    textual; lo que no aparezca literal en la transcripción se descarta después.
 */

const EsquemaRespuesta = z.object({
  clusters: z.array(
    z.object({
      cluster_id: z
        .string()
        .describe('Identificador corto en minúsculas, sin espacios ni acentos. Ej: "alumbrado".'),
      etiqueta: z.string().describe('Nombre del tema en castellano rioplatense, 2 a 4 palabras.'),
      miembros: z.array(
        z.object({
          id: z.string().describe('El id del fragmento, tal cual vino en la entrada.'),
          cita_textual: z
            .string()
            .describe(
              'Fragmento copiado LITERALMENTE del texto de ese id, sin corregir ni resumir. ' +
                'Una oración. Si ninguna oración representa al tema, cadena vacía.',
            ),
        }),
      ),
    }),
  ),
});

const INSTRUCCIONES = [
  'Sos parte del procesamiento de una encuesta barrial del Municipio de Esquel.',
  'Recibís respuestas habladas de vecinos, ya desgrabadas, sobre una misma pregunta.',
  '',
  'Tu tarea: agruparlas en temas y nombrar cada tema.',
  '',
  'Reglas:',
  '- Cada fragmento va a exactamente un tema. Ninguno queda afuera.',
  '- Preferí los identificadores de la lista sugerida cuando el tema encaje; si no encaja ninguno, creá uno nuevo.',
  '- Lo que no entre en ningún tema va a "otros". Es preferible "otros" antes que inventar un tema con un solo caso forzado.',
  '- La cita se COPIA LITERAL del texto del fragmento: ni una palabra distinta, ni corregida, ni acortada con puntos suspensivos.',
  '- No agregues interpretación, diagnóstico ni recomendaciones. Solo agrupás y nombrás.',
].join('\n');

export type ConfigAnthropic = {
  apiKey: string | undefined;
  modelo: string;
  timeoutMs?: number;
  maxTokens?: number;
};

export class ProveedorAnthropic implements ClusteringProvider {
  readonly nombre = 'anthropic';
  readonly requiereRed = true;

  constructor(private readonly config: ConfigAnthropic) {}

  verificarConfiguracion(): VerificacionProveedor {
    const problemas: string[] = [];
    if (!this.config.apiKey) problemas.push('Falta ANTHROPIC_API_KEY.');
    if (!this.config.modelo) problemas.push('Falta ANTHROPIC_MODEL.');
    return problemas.length === 0 ? { ok: true } : { ok: false, problemas };
  }

  async agrupar(entrada: EntradaClustering, señal?: AbortSignal): Promise<ResultadoClustering> {
    const verificacion = this.verificarConfiguracion();
    if (!verificacion.ok) {
      throw new ErrorClustering('configuracion', verificacion.problemas.join(' '), {
        reintentable: false,
      });
    }
    if (entrada.fragmentos.length === 0) {
      throw new ErrorClustering('vacio', 'No hay fragmentos para agrupar.');
    }

    // Identificadores cortos: al proveedor no le llega ningún id interno del sistema.
    const porId = new Map(entrada.fragmentos.map((f, i) => [`f${i + 1}`, f]));

    const cliente = new Anthropic({
      apiKey: this.config.apiKey as string,
      timeout: this.config.timeoutMs ?? 600000,
    });

    let respuesta;
    try {
      respuesta = await cliente.messages.parse(
        {
          model: this.config.modelo,
          max_tokens: this.config.maxTokens ?? 16000,
          thinking: { type: 'adaptive' },
          system: INSTRUCCIONES,
          messages: [{ role: 'user', content: this.armarPedido(entrada, porId) }],
          output_config: { format: zodOutputFormat(EsquemaRespuesta) },
        },
        señal ? { signal: señal } : undefined,
      );
    } catch (error: unknown) {
      throw traducirError(error);
    }

    const salida = respuesta.parsed_output;
    if (!salida) {
      throw new ErrorClustering(
        'respuesta_invalida',
        'El modelo no devolvió una respuesta con el formato pedido.',
        { detalle: { stopReason: respuesta.stop_reason } },
      );
    }

    return {
      clusters: reconstruir(salida.clusters, porId),
      proveedor: this.nombre,
      modelo: respuesta.model,
    };
  }

  private armarPedido(
    entrada: EntradaClustering,
    porId: ReadonlyMap<string, { texto: string }>,
  ): string {
    const sugeridos = [...TEMAS, TEMA_OTROS]
      .map((tema) => `- ${tema.clusterId}: ${tema.etiqueta}`)
      .join('\n');
    const fragmentos = [...porId.entries()]
      .map(([id, fragmento]) => `<fragmento id="${id}">\n${fragmento.texto}\n</fragmento>`)
      .join('\n');
    const tope = entrada.maximoClusters ?? 10;

    return [
      entrada.preguntaTexto
        ? `Pregunta del cuestionario: «${entrada.preguntaTexto}»`
        : `Pregunta del cuestionario: ${entrada.preguntaId}`,
      '',
      'Identificadores de tema sugeridos:',
      sugeridos,
      '',
      `Como máximo ${tope} temas en total.`,
      '',
      'Fragmentos:',
      fragmentos,
    ].join('\n');
  }
}

/**
 * Vuelve de los ids cortos a los ids internos, descarta lo que el modelo haya
 * inventado y manda a "otros" cualquier fragmento que se haya olvidado. Después de
 * esta función, todo fragmento de la entrada está en exactamente un tema.
 */
function reconstruir(
  clusters: z.infer<typeof EsquemaRespuesta>['clusters'],
  porId: ReadonlyMap<string, { transcripcionId: string }>,
): ClusterTematico[] {
  const usados = new Set<string>();
  const salida: ClusterTematico[] = [];

  for (const cluster of clusters) {
    const miembros: MiembroCluster[] = [];
    for (const miembro of cluster.miembros) {
      const fragmento = porId.get(miembro.id);
      if (!fragmento || usados.has(miembro.id)) continue;
      usados.add(miembro.id);
      const cita = miembro.cita_textual.trim();
      miembros.push({
        transcripcionId: fragmento.transcripcionId,
        citaTextual: cita.length > 0 ? cita : undefined,
      });
    }
    if (miembros.length > 0) {
      salida.push({
        clusterId: normalizarId(cluster.cluster_id),
        etiqueta: cluster.etiqueta.trim() || cluster.cluster_id,
        miembros,
      });
    }
  }

  const huerfanos = [...porId.entries()]
    .filter(([id]) => !usados.has(id))
    .map(([, fragmento]) => ({ transcripcionId: fragmento.transcripcionId }));

  if (huerfanos.length > 0) {
    const otros = salida.find((cluster) => cluster.clusterId === TEMA_OTROS.clusterId);
    if (otros) {
      salida[salida.indexOf(otros)] = {
        ...otros,
        miembros: [...otros.miembros, ...huerfanos],
      };
    } else {
      salida.push({ ...TEMA_OTROS, miembros: huerfanos });
    }
  }

  return salida;
}

function normalizarId(bruto: string): string {
  const limpio = bruto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return limpio || TEMA_OTROS.clusterId;
}

/** Del error del SDK a nuestra causa tipificada, de lo más específico a lo general. */
function traducirError(error: unknown): ErrorClustering {
  if (error instanceof Anthropic.AuthenticationError) {
    return new ErrorClustering('configuracion', 'La ANTHROPIC_API_KEY fue rechazada.', {
      reintentable: false,
    });
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return new ErrorClustering('configuracion', 'La clave no tiene permiso para este modelo.', {
      reintentable: false,
    });
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new ErrorClustering('respuesta_invalida', `Pedido inválido: ${error.message}`, {
      reintentable: false,
    });
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new ErrorClustering('red', 'El proveedor limitó la tasa de pedidos.', {
      reintentable: true,
    });
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new ErrorClustering('red', `No se pudo conectar con el proveedor: ${error.message}`);
  }
  if (error instanceof Anthropic.APIError) {
    return new ErrorClustering('rechazado_por_proveedor', `Error ${error.status}: ${error.message}`, {
      reintentable: typeof error.status === 'number' && error.status >= 500,
    });
  }
  if (error instanceof Error) {
    return new ErrorClustering('red', error.message);
  }
  return new ErrorClustering('red', 'Falló el agrupamiento por una causa desconocida.');
}
