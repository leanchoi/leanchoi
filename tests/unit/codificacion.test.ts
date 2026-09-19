import { describe, expect, it } from 'vitest';
import { agruparPorPregunta, codificarPendientes, verificarCita } from '@/lib/codificacion/pipeline';
import type { DependenciasCodificacion } from '@/lib/codificacion/pipeline';
import { ProveedorStub } from '@/lib/codificacion/proveedores/stub';
import type { ConfigCodificacion } from '@/lib/codificacion/registro';
import type { EventoAuditoria, FilaCodificacion, RepositorioCodificacion } from '@/lib/codificacion/repositorio';
import { esCitaTextual } from '@/lib/codificacion/tipos';
import type { ClusteringProvider, FragmentoACodificar } from '@/lib/codificacion/tipos';

const CONFIG: ConfigCodificacion = {
  habilitado: true,
  proveedor: 'stub',
  maximoClusters: 10,
  loteProceso: 100,
  minimoFragmentos: 2,
};

function fragmento(n: number, texto: string, preguntaId = 'abierta-01'): FragmentoACodificar {
  return {
    transcripcionId: `t-${n}`,
    ticket: `k-${n}`,
    preguntaId,
    barrioId: 'b-1',
    texto,
  };
}

class RepoMemoria implements RepositorioCodificacion {
  guardadas: Omit<FilaCodificacion, 'id'>[] = [];
  auditoria: EventoAuditoria[] = [];
  constructor(private readonly pendientes: FragmentoACodificar[]) {}

  async listarSinCodificar(limite: number): Promise<FragmentoACodificar[]> {
    return this.pendientes.slice(0, limite);
  }
  async guardar(filas: readonly Omit<FilaCodificacion, 'id'>[]): Promise<number> {
    this.guardadas.push(...filas);
    return filas.length;
  }
  async registrarAuditoria(evento: EventoAuditoria): Promise<void> {
    this.auditoria.push(evento);
  }
}

const TEXTOS = [
  'No hay luz en toda la cuadra. La luminaria de la esquina está quemada hace meses.',
  'La calle es un barro cuando llueve. No entra ni el auto ni la ambulancia.',
  'El recolector no llega hasta el fondo y se junta basura en el baldío.',
  'Pedimos que la sala de salud atienda a la tarde, los turnos se dan muy temprano.',
  'Hay perros sueltos y el mes pasado mordieron a un chico.',
  'La calle está sin asfalto y los pozos rompen los autos.',
];

describe('agrupamiento temático (stub)', () => {
  it('es determinístico: la misma entrada da siempre la misma salida', async () => {
    const proveedor = new ProveedorStub();
    const entrada = { preguntaId: 'abierta-01', fragmentos: TEXTOS.map((t, i) => fragmento(i, t)) };

    const a = await proveedor.agrupar(entrada);
    const b = await proveedor.agrupar(entrada);

    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('no necesita red ni claves', () => {
    const proveedor = new ProveedorStub();
    expect(proveedor.requiereRed).toBe(false);
    expect(proveedor.verificarConfiguracion()).toEqual({ ok: true });
  });

  it('pone cada texto en exactamente un tema y reconoce los temas del léxico', async () => {
    const fragmentos = TEXTOS.map((t, i) => fragmento(i, t));
    const { clusters } = await new ProveedorStub().agrupar({
      preguntaId: 'abierta-01',
      fragmentos,
    });

    const asignados = clusters.flatMap((c) => c.miembros.map((m) => m.transcripcionId));
    expect(asignados).toHaveLength(fragmentos.length);
    expect(new Set(asignados).size).toBe(fragmentos.length);

    const etiquetas = new Map(clusters.map((c) => [c.clusterId, c]));
    expect(etiquetas.get('alumbrado')?.miembros.map((m) => m.transcripcionId)).toEqual(['t-0']);
    expect(etiquetas.get('calles')?.miembros.map((m) => m.transcripcionId)).toEqual(['t-1', 't-5']);
    expect(etiquetas.get('animales')?.etiqueta).toBe('Animales sueltos');
  });

  it('respeta el tope de temas juntando el resto en "otros"', async () => {
    const { clusters } = await new ProveedorStub().agrupar({
      preguntaId: 'abierta-01',
      fragmentos: TEXTOS.map((t, i) => fragmento(i, t)),
      maximoClusters: 3,
    });

    expect(clusters.length).toBeLessThanOrEqual(3);
    const total = clusters.reduce((suma, c) => suma + c.miembros.length, 0);
    expect(total).toBe(TEXTOS.length);
    expect(clusters.some((c) => c.clusterId === 'otros')).toBe(true);
  });
});

describe('la cita es literal o no es', () => {
  const texto = 'La calle está sin asfalto y los pozos rompen los autos.';

  it('acepta una cita copiada tal cual', () => {
    expect(esCitaTextual('los pozos rompen los autos', texto)).toBe(true);
    expect(verificarCita('  La calle está sin asfalto  ', texto)).toBe('La calle está sin asfalto');
  });

  it('tolera espacios de más, acentos perdidos y comillas', () => {
    expect(esCitaTextual('«los  pozos rompen los  autos»', texto)).toBe(true);
    expect(esCitaTextual('La calle esta sin asfalto', texto)).toBe(true);
  });

  it('rechaza cualquier frase que el vecino no dijo', () => {
    expect(esCitaTextual('los vecinos exigen asfalto urgente', texto)).toBe(false);
    expect(verificarCita('El barrio pide asfalto', texto)).toBeNull();
    expect(verificarCita(undefined, texto)).toBeNull();
  });

  it('el stub recorta la cita del propio texto, así que siempre verifica', async () => {
    const fragmentos = TEXTOS.map((t, i) => fragmento(i, t));
    const { clusters } = await new ProveedorStub().agrupar({
      preguntaId: 'abierta-01',
      fragmentos,
    });
    const porId = new Map(fragmentos.map((f) => [f.transcripcionId, f.texto]));

    for (const cluster of clusters) {
      for (const miembro of cluster.miembros) {
        const fuente = porId.get(miembro.transcripcionId) ?? '';
        expect(verificarCita(miembro.citaTextual, fuente)).not.toBeNull();
      }
    }
  });
});

describe('pipeline de codificación', () => {
  function deps(
    pendientes: FragmentoACodificar[],
    config: Partial<ConfigCodificacion> = {},
    proveedor: ClusteringProvider = new ProveedorStub(),
  ): DependenciasCodificacion & { repo: RepoMemoria } {
    return { repo: new RepoMemoria(pendientes), proveedor, config: { ...CONFIG, ...config } };
  }

  it('con el flag apagado no toca nada del sistema', async () => {
    const d = deps(TEXTOS.map((t, i) => fragmento(i, t)), { habilitado: false });
    const resumen = await codificarPendientes(d);

    expect(resumen.codificaciones).toBe(0);
    expect(d.repo.guardadas).toHaveLength(0);
    expect(d.repo.auditoria).toHaveLength(0);
    expect(resumen.motivo).toContain('FEATURE_CLUSTERING');
  });

  it('guarda una codificación por texto y deja rastro en la auditoría', async () => {
    const d = deps(TEXTOS.map((t, i) => fragmento(i, t)));
    const resumen = await codificarPendientes(d);

    expect(resumen.fragmentos).toBe(TEXTOS.length);
    expect(d.repo.guardadas).toHaveLength(TEXTOS.length);
    expect(d.repo.guardadas.every((fila) => fila.barrioId === 'b-1')).toBe(true);
    expect(d.repo.auditoria.map((e) => e.accion)).toEqual(['codificacion.pregunta']);
  });

  it('descarta la cita inventada y conserva el tema', async () => {
    const mentiroso: ClusteringProvider = {
      nombre: 'mentiroso',
      requiereRed: false,
      verificarConfiguracion: () => ({ ok: true }),
      agrupar: async (entrada) => ({
        proveedor: 'mentiroso',
        clusters: [
          {
            clusterId: 'alumbrado',
            etiqueta: 'Alumbrado público',
            miembros: entrada.fragmentos.map((f) => ({
              transcripcionId: f.transcripcionId,
              citaTextual: 'Los vecinos están cansados de la desidia municipal',
            })),
          },
        ],
      }),
    };

    const d = deps(TEXTOS.map((t, i) => fragmento(i, t)), {}, mentiroso);
    const resumen = await codificarPendientes(d);

    expect(resumen.citasVerificadas).toBe(0);
    expect(resumen.citasDescartadas).toBe(TEXTOS.length);
    expect(d.repo.guardadas).toHaveLength(TEXTOS.length);
    expect(d.repo.guardadas.every((fila) => fila.citaTextual === null)).toBe(true);
    expect(d.repo.guardadas.every((fila) => fila.clusterId === 'alumbrado')).toBe(true);
  });

  it('no agrupa preguntas con muy pocos textos: las deja para la próxima corrida', async () => {
    const pendientes = [
      ...TEXTOS.map((t, i) => fragmento(i, t)),
      fragmento(90, 'Falta una plaza para los chicos.', 'abierta-02'),
    ];
    const d = deps(pendientes, { minimoFragmentos: 3 });
    const resumen = await codificarPendientes(d);

    expect(resumen.preguntas).toBe(1);
    expect(resumen.omitidas).toBe(1);
    expect(d.repo.guardadas.some((fila) => fila.transcripcionId === 't-90')).toBe(false);
  });

  it('agrupa por pregunta: los temas de una no se mezclan con los de otra', () => {
    const mapa = agruparPorPregunta([
      fragmento(1, 'a', 'p1'),
      fragmento(2, 'b', 'p2'),
      fragmento(3, 'c', 'p1'),
    ]);
    expect([...mapa.keys()]).toEqual(['p1', 'p2']);
    expect(mapa.get('p1')).toHaveLength(2);
  });
});

describe('proveedor Anthropic', () => {
  it('avisa qué falta antes de gastar una llamada', async () => {
    const { ProveedorAnthropic } = await import('@/lib/codificacion/proveedores/anthropic');
    const sinClave = new ProveedorAnthropic({ apiKey: undefined, modelo: 'claude-opus-5' });

    expect(sinClave.verificarConfiguracion()).toEqual({
      ok: false,
      problemas: ['Falta ANTHROPIC_API_KEY.'],
    });
    expect(new ProveedorAnthropic({ apiKey: 'x', modelo: 'claude-opus-5' }).verificarConfiguracion())
      .toEqual({ ok: true });
  });

  it('no sale a la red si está mal configurado', async () => {
    const { ProveedorAnthropic } = await import('@/lib/codificacion/proveedores/anthropic');
    const { ErrorClustering } = await import('@/lib/codificacion/tipos');
    const proveedor = new ProveedorAnthropic({ apiKey: undefined, modelo: 'claude-opus-5' });

    await expect(
      proveedor.agrupar({ preguntaId: 'p1', fragmentos: [fragmento(1, 'hola')] }),
    ).rejects.toMatchObject({ name: 'ErrorClustering', causa: 'configuracion', reintentable: false });
    expect(ErrorClustering).toBeDefined();
  });
});
