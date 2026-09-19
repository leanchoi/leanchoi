import { getEnv } from '@/lib/env';

/**
 * Salida de correo.
 *
 * En cualquier entorno que no sea producción el transporte es de **consola**: el
 * mensaje se imprime en el log y no sale a ningún lado. Es a propósito y no se puede
 * saltear con una variable de entorno: en una base de prueba hay vecinos reales
 * cargados, y un envío por error les llega de verdad.
 */

export type Correo = {
  para: string;
  asunto: string;
  cuerpo: string;
};

export type ResultadoEnvio = {
  enviado: boolean;
  transporte: string;
  detalle?: string;
};

export interface TransporteCorreo {
  readonly nombre: string;
  enviar(correo: Correo): Promise<ResultadoEnvio>;
}

export class TransporteConsola implements TransporteCorreo {
  readonly nombre = 'console';

  async enviar(correo: Correo): Promise<ResultadoEnvio> {
    console.log(
      [
        '',
        '───────── correo NO enviado (transporte de consola) ─────────',
        `Para:    ${correo.para}`,
        `Asunto:  ${correo.asunto}`,
        '',
        correo.cuerpo,
        '─────────────────────────────────────────────────────────────',
        '',
      ].join('\n'),
    );
    return { enviado: false, transporte: this.nombre, detalle: 'impreso en el log' };
  }
}

export class TransporteSmtp implements TransporteCorreo {
  readonly nombre = 'smtp';

  constructor(
    private readonly config: {
      host: string;
      port: number;
      user?: string | undefined;
      password?: string | undefined;
      from: string;
    },
  ) {}

  async enviar(correo: Correo): Promise<ResultadoEnvio> {
    const { createTransport } = await import('nodemailer');
    const transporte = createTransport({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.port === 465,
      ...(this.config.user
        ? { auth: { user: this.config.user, pass: this.config.password ?? '' } }
        : {}),
    });

    await transporte.sendMail({
      from: this.config.from,
      to: correo.para,
      subject: correo.asunto,
      text: correo.cuerpo,
    });

    return { enviado: true, transporte: this.nombre };
  }
}

export function crearTransporteCorreo(): TransporteCorreo {
  const env = getEnv();

  if (env.MAIL_TRANSPORT === 'smtp') {
    if (env.NODE_ENV !== 'production') {
      console.warn(
        '[correo] MAIL_TRANSPORT=smtp fuera de producción: se usa el transporte de consola. ' +
          'No se envían correos reales en desarrollo.',
      );
      return new TransporteConsola();
    }
    if (!env.SMTP_HOST || !env.SMTP_PORT) {
      console.error('[correo] Falta SMTP_HOST o SMTP_PORT: se usa el transporte de consola.');
      return new TransporteConsola();
    }
    return new TransporteSmtp({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      user: env.SMTP_USER,
      password: env.SMTP_PASSWORD,
      from: env.MAIL_FROM,
    });
  }

  return new TransporteConsola();
}
