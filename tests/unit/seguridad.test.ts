import { describe, expect, it } from 'vitest';
import { CuerpoDemasiadoGrande, leerJsonLimitado } from '@/lib/seguridad/cuerpo';
import { cabecerasDeEspera, clienteDe, Freno } from '@/lib/seguridad/freno';

describe('freno de intentos', () => {
  it('deja pasar hasta el máximo y frena el siguiente', () => {
    const freno = new Freno({ maximo: 3, ventanaMs: 60_000 });

    expect(freno.registrar('ip').frenado).toBe(false);
    expect(freno.registrar('ip').frenado).toBe(false);
    expect(freno.registrar('ip').frenado).toBe(false);

    const cuarto = freno.registrar('ip');
    expect(cuarto.frenado).toBe(true);
    expect(cuarto.intentos).toBe(4);
    expect(cuarto.esperaSegundos).toBeGreaterThan(0);
  });

  it('cuenta por clave: un vecino frenado no frena al otro', () => {
    const freno = new Freno({ maximo: 1, ventanaMs: 60_000 });

    freno.registrar('ip-1');
    expect(freno.registrar('ip-1').frenado).toBe(true);
    expect(freno.registrar('ip-2').frenado).toBe(false);
  });

  it('se libera cuando pasa la ventana', () => {
    const freno = new Freno({ maximo: 1, ventanaMs: 1_000 });
    const t0 = 1_000_000;

    freno.registrar('ip', t0);
    expect(freno.registrar('ip', t0 + 500).frenado).toBe(true);
    expect(freno.registrar('ip', t0 + 1_001).frenado).toBe(false);
  });

  it('perdona al que acertó, para no castigar el dedo lento', () => {
    const freno = new Freno({ maximo: 2, ventanaMs: 60_000 });

    freno.registrar('ip');
    freno.registrar('ip');
    freno.perdonar('ip');

    expect(freno.registrar('ip').intentos).toBe(1);
  });

  it('barre lo vencido: el mapa no crece para siempre', () => {
    const freno = new Freno({ maximo: 5, ventanaMs: 1_000 });
    const t0 = 1_000_000;

    for (let i = 0; i < 50; i += 1) freno.registrar(`ip-${i}`, t0);
    expect(freno.tamaño).toBe(50);

    freno.registrar('ip-nueva', t0 + 2_000);
    expect(freno.tamaño).toBe(1);
  });

  it('tiene techo de claves: rotar la IP no llena la memoria', () => {
    const freno = new Freno({ maximo: 5, ventanaMs: 600_000, maximoClaves: 10 });

    for (let i = 0; i < 100; i += 1) freno.registrar(`ip-${i}`);
    expect(freno.tamaño).toBeLessThanOrEqual(10);
  });

  it('saca el cliente real de la cadena del proxy', () => {
    const con = (headers: Record<string, string>) => clienteDe(new Request('http://x', { headers }));

    expect(con({ 'x-forwarded-for': '190.1.2.3, 10.0.0.1' })).toBe('190.1.2.3');
    expect(con({ 'x-real-ip': '190.1.2.4' })).toBe('190.1.2.4');
    expect(con({})).toBe('sin-proxy');
  });

  it('responde con Retry-After en segundos', () => {
    expect(cabecerasDeEspera({ frenado: true, intentos: 9, esperaSegundos: 42 })).toEqual({
      'Retry-After': '42',
    });
    expect(cabecerasDeEspera({ frenado: true, intentos: 9, esperaSegundos: 0 })).toEqual({
      'Retry-After': '1',
    });
  });
});

describe('techo del cuerpo del pedido', () => {
  function pedido(cuerpo: string, conLargo = true): Request {
    return new Request('http://x/api/sync', {
      method: 'POST',
      headers: conLargo
        ? { 'content-length': String(new TextEncoder().encode(cuerpo).byteLength) }
        : {},
      body: cuerpo,
    });
  }

  it('lee un lote normal', async () => {
    const datos = await leerJsonLimitado(pedido(JSON.stringify({ eventos: [1, 2] })), 1024);
    expect(datos).toEqual({ eventos: [1, 2] });
  });

  it('rechaza por Content-Length sin leer el cuerpo', async () => {
    await expect(leerJsonLimitado(pedido('x'.repeat(2000)), 100)).rejects.toBeInstanceOf(
      CuerpoDemasiadoGrande,
    );
  });

  it('rechaza también cuando la cabecera miente o no viene', async () => {
    await expect(
      leerJsonLimitado(pedido('x'.repeat(2000), false), 100),
    ).rejects.toBeInstanceOf(CuerpoDemasiadoGrande);
  });

  it('devuelve null si el cuerpo no es JSON, en vez de explotar', async () => {
    expect(await leerJsonLimitado(pedido('esto no es json'), 1024)).toBeNull();
  });
});
