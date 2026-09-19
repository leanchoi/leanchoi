import type { UsuarioSesion } from '@/lib/auth/usuarios';
import { codigoCorto } from '@/lib/campo/ticket';
import { getEnv } from '@/lib/env';
import { conContactoParaEnvio, registrarAcuse } from '@/lib/identificada/acceso';
import { crearTransporteCorreo } from './correo';
import { obtenerDerivacion } from './derivaciones';
import { construirMensaje, PromesaSinRespaldo } from './plantillas';
import type { TipoPlantilla } from './plantillas';

/**
 * Envío de la comunicación al vecino.
 *
 * REGLA 4: la única puerta de salida es esta función. Si el tipo es `compromiso` y
 * la derivación no tiene orden de trabajo, `construirMensaje` lanza y **no se envía
 * nada**: el mensaje ni siquiera llega a armarse.
 *
 * Los datos de contacto no salen de acá: se usan dentro de `conContactoParaEnvio`
 * para armar el correo y no se devuelven a ninguna capa de arriba.
 */

export type ResultadoAcuse = {
  acuseId: string;
  enviado: boolean;
  canal: 'email' | 'telefono' | 'presencial';
  /** Para mostrar en el panel lo que se le dijo, sin datos personales. */
  cuerpo: string;
  detalle?: string;
};

export class DerivacionInexistente extends Error {
  constructor(id: string) {
    super(`No existe la derivación ${id}.`);
    this.name = 'DerivacionInexistente';
  }
}

export async function enviarAcuse(
  usuario: UsuarioSesion,
  opciones: { derivacionId: string; tipo: TipoPlantilla },
): Promise<ResultadoAcuse> {
  const derivacion = await obtenerDerivacion(opciones.derivacionId);
  if (!derivacion) throw new DerivacionInexistente(opciones.derivacionId);

  const env = getEnv();
  const codigo = codigoCorto(derivacion.ticket);

  const datosBase = {
    ticket: derivacion.ticket,
    codigo,
    barrioNombre: derivacion.barrioNombre,
    competencia: derivacion.competencia,
    areaDestino: derivacion.areaDestino,
    descripcion: derivacion.descripcion,
    ordenTrabajoNro: derivacion.ordenTrabajoNro,
    urlConsulta: `${env.APP_BASE_URL}/ticket`,
  };

  // Si esto lanza (PromesaSinRespaldo), no se envía ni se registra nada.
  const sinNombre = construirMensaje(opciones.tipo, datosBase);

  const resultado = await conContactoParaEnvio(derivacion.ticket, async (contacto) => {
    if (!contacto.email) {
      return { enviado: false, canal: 'presencial' as const, detalle: 'el vecino no dejó correo' };
    }
    const mensaje = construirMensaje(opciones.tipo, { ...datosBase, nombre: contacto.nombre });
    const envio = await crearTransporteCorreo().enviar({
      para: contacto.email,
      asunto: mensaje.asunto,
      cuerpo: mensaje.cuerpo,
    });
    return { enviado: envio.enviado, canal: 'email' as const, detalle: envio.detalle };
  });

  const canal = resultado?.canal ?? 'presencial';
  const enviado = resultado?.enviado ?? false;

  const acuseId = await registrarAcuse(
    {
      ticket: derivacion.ticket,
      plantilla: opciones.tipo,
      competencia: derivacion.competencia,
      canal,
      cuerpo: sinNombre.cuerpo,
      ordenTrabajoNro: derivacion.ordenTrabajoNro,
      enviado,
    },
    usuario.id,
  );

  return {
    acuseId,
    enviado,
    canal,
    cuerpo: sinNombre.cuerpo,
    ...(resultado?.detalle ? { detalle: resultado.detalle } : {}),
  };
}

export { PromesaSinRespaldo };
