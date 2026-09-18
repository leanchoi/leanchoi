import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { AlmacenamientoEnMemoria } from '@/lib/audio/almacenamiento';
import type { ConfigAudio } from '@/lib/audio/config';
import {
  AudioRechazado,
  procesarAudio,
  purgarAudiosVencidos,
  registrarAudio,
} from '@/lib/audio/pipeline';
import type { DependenciasAudio } from '@/lib/audio/pipeline';
import { ProveedorStub } from '@/lib/audio/proveedores/stub';
import { ErrorTranscripcion } from '@/lib/audio/tipos';
import type {
  EntradaTranscripcion,
  ResultadoTranscripcion,
  TranscriptionProvider,
} from '@/lib/audio/tipos';
import { RepositorioEnMemoria } from '../util/repositorio-memoria';

/**
 * REGLA: el audio es temporal.
 *
 * Existe solo hasta que la desgrabación queda asegurada; después desaparece del
 * sistema. Si no se pudo desgrabar, sobrevive hasta el TTL y después se borra
 * igual. Nunca hay una ruta que devuelva los bytes.
 */

const CONFIG: ConfigAudio = {
  habilitado: true,
  proveedor: 'stub',
  directorio: '/tmp/no-usado',
  maxBytes: 20 * 1024 * 1024,
  mimesPermitidos: ['audio/ogg', 'audio/webm'],
  ttlHoras: 72,
  reintentosMax: 3,
  loteProceso: 10,
  tokenWorker: 'token-de-prueba-largo',
  idioma: 'es-AR',
  ffmpegPath: undefined,
};

const TICKET = '018f3a5e-7c1d-7b2a-8f11-2b3c4d5e6f70';
const BYTES = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

class ProveedorQueFalla implements TranscriptionProvider {
  readonly nombre = 'falla';
  readonly mimesSoportados = ['*'] as const;
  readonly requiereRed = true;
  verificarConfiguracion() {
    return { ok: true } as const;
  }
  async transcribir(): Promise<ResultadoTranscripcion> {
    throw new ErrorTranscripcion('red', 'el servicio no respondió');
  }
}

class ProveedorVacio implements TranscriptionProvider {
  readonly nombre = 'vacio';
  readonly mimesSoportados = ['*'] as const;
  readonly requiereRed = true;
  verificarConfiguracion() {
    return { ok: true } as const;
  }
  async transcribir(_entrada: EntradaTranscripcion): Promise<ResultadoTranscripcion> {
    return { texto: '   ', proveedor: this.nombre };
  }
}

function armar(proveedor: TranscriptionProvider = new ProveedorStub()) {
  const repo = new RepositorioEnMemoria();
  const almacen = new AlmacenamientoEnMemoria();
  const deps: DependenciasAudio = { repo, almacen, proveedor, config: CONFIG };
  return { repo, almacen, deps };
}

async function subir(deps: DependenciasAudio) {
  return registrarAudio(deps, {
    ticket: TICKET,
    preguntaId: 'p-abierta-1',
    mime: 'audio/ogg',
    duracionSegundos: 12,
    bytes: BYTES,
  });
}

describe('el audio desaparece una vez asegurada la desgrabación', () => {
  let contexto: ReturnType<typeof armar>;

  beforeEach(() => {
    contexto = armar();
  });

  it('guarda el audio al recibirlo y lo deja pendiente', async () => {
    const audio = await subir(contexto.deps);
    expect(audio.estado).toBe('pendiente');
    expect(audio.rutaRelativa).not.toBeNull();
    expect(contexto.almacen.cantidad).toBe(1);
    expect(contexto.repo.auditoria.map((e) => e.accion)).toContain('audio_recibido');
  });

  it('borra los bytes apenas la transcripción queda asegurada', async () => {
    const audio = await subir(contexto.deps);
    const resultado = await procesarAudio(contexto.deps, audio);

    expect(resultado.estado).toBe('transcripto');
    expect(contexto.almacen.cantidad).toBe(0);

    const guardado = await contexto.repo.obtener(audio.id);
    expect(guardado?.estado).toBe('transcripto');
    expect(guardado?.rutaRelativa).toBeNull();
    expect(guardado?.purgadoEn).not.toBeNull();
    expect(guardado?.purgaMotivo).toBe('transcripcion_asegurada');

    // El texto queda; el audio no.
    expect(await contexto.repo.textoDeTranscripcion(audio.id)).toContain('transcripción de prueba');
    expect(contexto.repo.auditoria.map((e) => e.accion)).toContain('audio_purgado');
  });

  it('NO borra el audio si la desgrabación falla: queda para reintento', async () => {
    const { deps, almacen, repo } = armar(new ProveedorQueFalla());
    const audio = await subir(deps);
    const resultado = await procesarAudio(deps, audio);

    expect(resultado.estado).toBe('error');
    expect(almacen.cantidad).toBe(1);
    const guardado = await repo.obtener(audio.id);
    expect(guardado?.rutaRelativa).not.toBeNull();
    expect(guardado?.purgadoEn).toBeNull();
  });

  it('NO borra el audio si el proveedor devuelve texto vacío', async () => {
    const { deps, almacen } = armar(new ProveedorVacio());
    const audio = await subir(deps);
    const resultado = await procesarAudio(deps, audio);

    expect(resultado.estado).toBe('error');
    expect(almacen.cantidad).toBe(1);
  });

  it('NO borra el audio si la transcripción no se confirma en la base', async () => {
    const audio = await subir(contexto.deps);
    contexto.repo.fallarConfirmacion = true;

    const resultado = await procesarAudio(contexto.deps, audio);

    expect(resultado.estado).toBe('error');
    expect(contexto.almacen.cantidad).toBe(1);
    expect((await contexto.repo.obtener(audio.id))?.rutaRelativa).not.toBeNull();
  });

  it('borra igual los audios vencidos por TTL, aunque no se hayan desgrabado', async () => {
    const { deps, almacen, repo } = armar(new ProveedorQueFalla());
    const audio = await subir(deps);
    await procesarAudio(deps, audio);
    expect(almacen.cantidad).toBe(1);

    // Cuatro días después, con TTL de 72 horas.
    const despues = new Date(Date.now() + 96 * 3600_000);
    const resumen = await purgarAudiosVencidos({ ...deps, ahora: () => despues });

    expect(resumen.purgados).toBe(1);
    expect(resumen.porTtl).toBe(1);
    expect(almacen.cantidad).toBe(0);

    const guardado = await repo.obtener(audio.id);
    expect(guardado?.estado).toBe('purgado_sin_transcribir');
    expect(guardado?.purgaMotivo).toBe('ttl_vencido');
    expect(guardado?.rutaRelativa).toBeNull();
  });

  it('la purga no borra filas: queda el rastro de que el audio existió', async () => {
    const audio = await subir(contexto.deps);
    await procesarAudio(contexto.deps, audio);

    const guardado = await contexto.repo.obtener(audio.id);
    expect(guardado).not.toBeNull();
    expect(guardado?.sha256).toHaveLength(64);
    expect(guardado?.bytes).toBe(BYTES.byteLength);
  });
});

describe('controles de admisión del audio', () => {
  it('rechaza la carga si FEATURE_AUDIO está apagado', async () => {
    const { deps } = armar();
    const apagado = { ...deps, config: { ...CONFIG, habilitado: false } };
    await expect(subir(apagado)).rejects.toBeInstanceOf(AudioRechazado);
  });

  it('rechaza formatos no permitidos y archivos más grandes que el tope', async () => {
    const { deps } = armar();
    await expect(
      registrarAudio(deps, { ticket: TICKET, preguntaId: 'p1', mime: 'video/mp4', bytes: BYTES }),
    ).rejects.toMatchObject({ causa: 'mime_no_permitido' });

    const chico = { ...deps, config: { ...CONFIG, maxBytes: 4 } };
    await expect(
      registrarAudio(chico, { ticket: TICKET, preguntaId: 'p1', mime: 'audio/ogg', bytes: BYTES }),
    ).rejects.toMatchObject({ causa: 'demasiado_grande' });
  });
});

describe('ninguna ruta devuelve los bytes del audio', () => {
  const RAIZ = resolve(__dirname, '../..');

  function rutasApi(dir: string): string[] {
    return readdirSync(dir).flatMap((entrada) => {
      const ruta = join(dir, entrada);
      if (statSync(ruta).isDirectory()) return rutasApi(ruta);
      return entrada === 'route.ts' ? [ruta] : [];
    });
  }

  it('las rutas de audio no leen del almacenamiento ni devuelven binarios', () => {
    const sospechosas = rutasApi(join(RAIZ, 'src/app/api')).filter((ruta) => {
      const contenido = readFileSync(ruta, 'utf8');
      return (
        /almacen\.leer|\.leer\(/.test(contenido) ||
        /new Response\([^)]*bytes/.test(contenido) ||
        /audio\/(ogg|webm|mpeg|wav)/.test(contenido)
      );
    });
    expect(sospechosas).toEqual([]);
  });
});
