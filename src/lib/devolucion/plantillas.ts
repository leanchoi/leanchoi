/**
 * Lo que el sistema le dice al vecino.
 *
 * REGLA 4: el acuse no promete. Toda comunicación automática acusa recibo y
 * clasifica la demanda por competencia. Una plantilla de tipo `compromiso` —la única
 * que dice "lo vamos a hacer"— NO SE PUEDE construir ni enviar sin un número de
 * orden de trabajo cargado. No es una validación de formulario: es una excepción que
 * corta el envío.
 *
 * La razón es simple: la forma más rápida de quemar un relevamiento es prometer lo
 * que no se puede cumplir, o hacerse cargo de lo que es de otra jurisdicción.
 */

export const TIPOS_PLANTILLA = ['acuse', 'derivacion', 'compromiso'] as const;
export type TipoPlantilla = (typeof TIPOS_PLANTILLA)[number];

export const COMPETENCIAS = ['municipal', 'provincial', 'nacional', 'privada'] as const;
export type Competencia = (typeof COMPETENCIAS)[number];

export const ETIQUETA_COMPETENCIA: Record<Competencia, string> = {
  municipal: 'del municipio',
  provincial: 'de la provincia',
  nacional: 'de la Nación',
  privada: 'de una empresa prestadora',
};

/** Qué dice cada plantilla, en una línea. Sirve para la interfaz y para el tablero. */
export const DESCRIPCION_PLANTILLA: Record<TipoPlantilla, string> = {
  acuse: 'Confirma que el pedido se registró. No promete nada.',
  derivacion: 'Informa a qué organismo corresponde el pedido y a dónde se derivó.',
  compromiso: 'Informa una orden de trabajo concreta. Exige número de orden.',
};

export type DatosMensaje = {
  ticket: string;
  codigo: string;
  /** Nombre de pila, si el vecino lo dejó. El mensaje funciona igual sin él. */
  nombre?: string | null;
  barrioNombre: string;
  competencia: Competencia;
  areaDestino: string;
  descripcion: string;
  ordenTrabajoNro?: string | null;
  urlConsulta: string;
};

/** Se lanza cuando alguien intenta prometer sin tener con qué respaldarlo. */
export class PromesaSinRespaldo extends Error {
  constructor(ticket: string) {
    super(
      `No se puede enviar una plantilla de tipo "compromiso" para el ticket ${ticket}: ` +
        'la derivación no tiene número de orden de trabajo. Sin orden no hay compromiso.',
    );
    this.name = 'PromesaSinRespaldo';
  }
}

export type Mensaje = { asunto: string; cuerpo: string };

const FIRMA = 'Dirección de Juntas Vecinales — Municipalidad de Esquel';

function saludo(nombre?: string | null): string {
  return nombre?.trim() ? `Hola ${nombre.trim()}:` : 'Hola:';
}

function pie(datos: DatosMensaje): string {
  return [
    '',
    `Su código de seguimiento es ${datos.codigo}.`,
    `Puede consultar en qué quedó su pedido en ${datos.urlConsulta}, con ese código o con su`,
    'apellido y los últimos 3 números de su documento.',
    '',
    FIRMA,
  ].join('\n');
}

/**
 * Arma el mensaje. Si el tipo es `compromiso` y no hay orden de trabajo, lanza:
 * el mensaje ni siquiera llega a existir.
 */
export function construirMensaje(tipo: TipoPlantilla, datos: DatosMensaje): Mensaje {
  if (tipo === 'compromiso' && !datos.ordenTrabajoNro?.trim()) {
    throw new PromesaSinRespaldo(datos.ticket);
  }

  switch (tipo) {
    case 'acuse':
      return {
        asunto: `Recibimos su pedido — ${datos.codigo}`,
        cuerpo: [
          saludo(datos.nombre),
          '',
          `Registramos lo que nos contó en el relevamiento del barrio ${datos.barrioNombre}:`,
          '',
          datos.descripcion,
          '',
          'Esto es un acuse de recibo: confirma que quedó anotado y que lo estamos revisando.',
          'Todavía no es una respuesta ni un compromiso de trabajo. Cuando haya novedades,',
          'se las vamos a informar por este mismo medio.',
          pie(datos),
        ].join('\n'),
      };

    case 'derivacion':
      return {
        asunto: `Su pedido fue derivado — ${datos.codigo}`,
        cuerpo: [
          saludo(datos.nombre),
          '',
          `Sobre lo que nos planteó en el relevamiento del barrio ${datos.barrioNombre}:`,
          '',
          datos.descripcion,
          '',
          `Este tema es competencia ${ETIQUETA_COMPETENCIA[datos.competencia]}, y lo derivamos a:`,
          datos.areaDestino,
          '',
          datos.competencia === 'municipal'
            ? 'Le vamos a avisar cuando el área nos informe cómo sigue.'
            : 'Le informamos a dónde corresponde el reclamo para que sepa dónde reclamar y',
          datos.competencia === 'municipal'
            ? ''
            : 'no quede dando vueltas. El municipio no puede resolverlo por sí mismo.',
          pie(datos),
        ]
          .filter((linea) => linea !== '')
          .join('\n'),
      };

    case 'compromiso':
      return {
        asunto: `Hay una orden de trabajo para su pedido — ${datos.codigo}`,
        cuerpo: [
          saludo(datos.nombre),
          '',
          `Sobre lo que nos planteó en el relevamiento del barrio ${datos.barrioNombre}:`,
          '',
          datos.descripcion,
          '',
          `Se generó la orden de trabajo N° ${datos.ordenTrabajoNro} a cargo de ${datos.areaDestino}.`,
          'Eso significa que el trabajo está previsto y tiene un expediente al que seguirle el rastro.',
          pie(datos),
        ].join('\n'),
      };

    default: {
      const nunca: never = tipo;
      throw new Error(`Tipo de plantilla desconocido: ${String(nunca)}`);
    }
  }
}

/**
 * ¿Se puede usar esta plantilla con estos datos? Para que la interfaz no ofrezca
 * botones que el servidor va a rechazar.
 */
export function plantillaDisponible(
  tipo: TipoPlantilla,
  ordenTrabajoNro?: string | null,
): { ok: true } | { ok: false; motivo: string } {
  if (tipo === 'compromiso' && !ordenTrabajoNro?.trim()) {
    return {
      ok: false,
      motivo: 'Cargá el número de orden de trabajo antes de comprometer algo.',
    };
  }
  return { ok: true };
}
