/**
 * Freno de intentos, en memoria del proceso.
 *
 * Alcanza para lo que este sistema tiene que aguantar: un operativo de dos meses,
 * una sola instancia, detrás de un proxy con TLS. No pretende ser un WAF. Si algún
 * día hay más de una instancia, esto se reemplaza por un contador compartido y
 * ninguna ruta se entera: todas usan `Freno`.
 *
 * Dos cuidados que no son decorativos:
 *
 *  - **Se barren las entradas vencidas.** Un Map que solo crece es, con el tiempo,
 *    la forma más aburrida de tirar abajo el servidor.
 *  - **Hay un techo de claves.** Si alguien rota la IP para llenar la memoria, al
 *    llegar al techo se descarta lo más viejo en vez de seguir creciendo.
 */

export type ConfigFreno = {
  /** Intentos permitidos dentro de la ventana. */
  maximo: number;
  /** Duración de la ventana, en milisegundos. */
  ventanaMs: number;
  /** Techo de claves distintas en memoria. */
  maximoClaves?: number;
};

export type Veredicto = {
  /** true si hay que responder 429. */
  frenado: boolean;
  /** Intentos ya consumidos en la ventana. */
  intentos: number;
  /** Segundos que faltan para que se libere, para la cabecera `Retry-After`. */
  esperaSegundos: number;
};

type Registro = { cantidad: number; hasta: number };

export class Freno {
  private readonly registros = new Map<string, Registro>();
  private readonly maximoClaves: number;

  constructor(private readonly config: ConfigFreno) {
    this.maximoClaves = config.maximoClaves ?? 10_000;
  }

  /** Anota un intento y dice si hay que frenar. Es la única operación que hace falta. */
  registrar(clave: string, ahora = Date.now()): Veredicto {
    this.barrer(ahora);

    const registro = this.registros.get(clave);

    if (!registro || ahora >= registro.hasta) {
      this.hacerLugar();
      this.registros.set(clave, { cantidad: 1, hasta: ahora + this.config.ventanaMs });
      return { frenado: false, intentos: 1, esperaSegundos: 0 };
    }

    registro.cantidad += 1;
    const espera = Math.ceil((registro.hasta - ahora) / 1000);

    return {
      frenado: registro.cantidad > this.config.maximo,
      intentos: registro.cantidad,
      esperaSegundos: espera,
    };
  }

  /** Éxito: se limpia la cuenta para no castigar a quien sí se acordó la clave. */
  perdonar(clave: string): void {
    this.registros.delete(clave);
  }

  get tamaño(): number {
    return this.registros.size;
  }

  private barrer(ahora: number): void {
    for (const [clave, registro] of this.registros) {
      if (ahora >= registro.hasta) this.registros.delete(clave);
    }
  }

  private hacerLugar(): void {
    while (this.registros.size >= this.maximoClaves) {
      const masVieja = this.registros.keys().next();
      if (masVieja.done) return;
      this.registros.delete(masVieja.value);
    }
  }
}

/**
 * De qué cliente viene el pedido. Detrás del proxy, `x-forwarded-for` trae la
 * cadena: el primero es el cliente real. Sin proxy no hay dato y se usa una clave
 * única: el freno sigue funcionando, solo que para todo el mundo junto.
 */
export function clienteDe(request: Request): string {
  const cadena = request.headers.get('x-forwarded-for');
  const primero = cadena?.split(',')[0]?.trim();
  return primero || request.headers.get('x-real-ip') || 'sin-proxy';
}

/** Cabeceras estándar para una respuesta 429. */
export function cabecerasDeEspera(veredicto: Veredicto): Record<string, string> {
  return { 'Retry-After': String(Math.max(1, veredicto.esperaSegundos)) };
}

/**
 * Freno perezoso: la configuración se lee del entorno la primera vez que se usa,
 * no cuando se importa el módulo. Importa para que `next build` pueda cargar las
 * rutas sin exigir un `.env` completo.
 */
export function frenoPerezoso(config: () => ConfigFreno): {
  registrar: (clave: string) => Veredicto;
  perdonar: (clave: string) => void;
} {
  let instancia: Freno | null = null;
  const obtener = (): Freno => (instancia ??= new Freno(config()));
  return {
    registrar: (clave) => obtener().registrar(clave),
    perdonar: (clave) => obtener().perdonar(clave),
  };
}
