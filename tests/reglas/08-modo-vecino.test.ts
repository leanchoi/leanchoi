import { describe, expect, it } from 'vitest';
import {
  avanzar,
  construirPasos,
  crearEncuesta,
  puedeRetroceder,
  responder,
  respuestasVisiblesParaEncuestador,
  retroceder,
} from '@/lib/campo/encuesta';
import type { Paso } from '@/lib/campo/encuesta';
import type { EncuestaLocal } from '@/lib/campo/tipos';
import {
  CuestionarioSchema,
  preguntasAutoadministradas,
  validarParaPublicar,
} from '@/lib/cuestionario';
import { conParche, CUESTIONARIO_V1 } from '../util/cuestionario';

/**
 * REGLA 8: bloque sensible autoadministrado.
 *
 * Las preguntas de seguridad, convivencia y evaluación de la junta vecinal se
 * contestan en modo vecino: el encuestador entrega el celular y al cerrar el bloque
 * no puede volver atrás a verlo.
 *
 * Acá se verifica la parte que vive en el instrumento: que el bloque exista y que
 * esté marcado de forma coherente. La parte de interfaz —pantalla limpia, sin vuelta
 * atrás— se verifica en la fase 3, cuando exista la app de campo.
 */

describe('el instrumento declara el bloque autoadministrado', () => {
  it('el cuestionario vigente tiene un bloque autoadministrado con sus preguntas marcadas', () => {
    const cuestionario = CuestionarioSchema.parse(CUESTIONARIO_V1);
    const bloques = cuestionario.bloques.filter((b) => b.autoadministrada);
    expect(bloques).toHaveLength(1);
    expect(bloques[0]?.preguntas.every((p) => p.autoadministrada)).toBe(true);
    expect(preguntasAutoadministradas(cuestionario).length).toBeGreaterThan(0);
  });

  it('un bloque autoadministrado con una pregunta sin marcar no se publica', () => {
    const roto = conParche((c) => {
      const bloque = c.bloques.find((b) => b.autoadministrada);
      const pregunta = bloque?.preguntas[0];
      if (pregunta) pregunta.autoadministrada = false;
    });
    const resultado = validarParaPublicar(roto, null);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.problemas.map((p) => p.codigo)).toContain(
      'bloque_autoadministrado_inconsistente',
    );
  });

  it('una pregunta autoadministrada suelta en un bloque común no se publica', () => {
    const roto = conParche((c) => {
      const pregunta = c.bloques[1]?.preguntas[0];
      if (pregunta) pregunta.autoadministrada = true;
    });
    const resultado = validarParaPublicar(roto, null);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.problemas.map((p) => p.codigo)).toContain('autoadministrada_fuera_de_bloque');
  });

  it('el bloque cubre seguridad, convivencia y la propia junta vecinal', () => {
    const cuestionario = CuestionarioSchema.parse(CUESTIONARIO_V1);
    const textos = preguntasAutoadministradas(cuestionario)
      .map((p) => p.texto.toLowerCase())
      .join(' ');
    expect(textos).toMatch(/segur/);
    expect(textos).toMatch(/convivencia/);
    expect(textos).toMatch(/junta vecinal/);
  });
});

// ---------------------------------------------------------------------------

const CUESTIONARIO = CuestionarioSchema.parse(CUESTIONARIO_V1);
const PASOS = construirPasos(CUESTIONARIO);

function encuestaNueva(): EncuestaLocal {
  const encuesta = crearEncuesta({
    cuestionario: CUESTIONARIO,
    viviendaId: 'v1',
    barrioId: 'b1',
    dispositivoId: 'd1',
  });
  return { ...encuesta, consentimientoVersion: CUESTIONARIO.consentimiento.version };
}

function indiceDe(predicado: (paso: Paso) => boolean): number {
  const indice = PASOS.findIndex(predicado);
  if (indice === -1) throw new Error('No se encontró el paso buscado.');
  return indice;
}

/** Contesta todo el bloque autoadministrado y lo cierra. */
function hastaSellarElBloque(): EncuestaLocal {
  const entrega = indiceDe((p) => p.tipo === 'entrega_celular');
  let encuesta: EncuestaLocal = { ...encuestaNueva(), paso: entrega };

  encuesta = avanzar(encuesta, PASOS); // entrega el celular al vecino
  while (PASOS[encuesta.paso]?.tipo === 'pregunta') {
    const paso = PASOS[encuesta.paso];
    if (paso?.tipo === 'pregunta')
      encuesta = responder(encuesta, paso.pregunta.id, 'una respuesta');
    encuesta = avanzar(encuesta, PASOS);
  }
  // Ahora está en la devolución del celular: al avanzar se sella.
  return avanzar(encuesta, PASOS);
}

describe('el bloque se entrega al vecino y se sella al cerrarlo', () => {
  it('el bloque autoadministrado va envuelto entre la entrega y la devolución del celular', () => {
    const entrega = indiceDe((p) => p.tipo === 'entrega_celular');
    const devolucion = indiceDe((p) => p.tipo === 'devolucion_celular');
    expect(entrega).toBeLessThan(devolucion);
    for (let i = entrega + 1; i < devolucion; i += 1) {
      const paso = PASOS[i];
      expect(paso?.tipo).toBe('pregunta');
      if (paso?.tipo === 'pregunta') expect(paso.autoadministrada).toBe(true);
    }
  });

  it('dentro del bloque el vecino sí puede corregir su respuesta anterior', () => {
    const entrega = indiceDe((p) => p.tipo === 'entrega_celular');
    let encuesta: EncuestaLocal = { ...encuestaNueva(), paso: entrega };
    encuesta = avanzar(encuesta, PASOS);
    const primera = PASOS[encuesta.paso];
    if (primera?.tipo === 'pregunta') encuesta = responder(encuesta, primera.pregunta.id, 3);
    encuesta = avanzar(encuesta, PASOS);

    expect(puedeRetroceder(encuesta, PASOS)).toBe(true);
    expect(retroceder(encuesta, PASOS).paso).toBe(encuesta.paso - 1);
  });

  it('cerrado el bloque, el encuestador NO puede volver atrás', () => {
    const encuesta = hastaSellarElBloque();
    expect(encuesta.bloquesSellados).toContain('convivencia-y-junta');
    expect(puedeRetroceder(encuesta, PASOS)).toBe(false);
    expect(retroceder(encuesta, PASOS)).toEqual(encuesta);
  });

  it('cerrado el bloque, el encuestador NO ve esas respuestas', () => {
    const encuesta = hastaSellarElBloque();
    const visibles = respuestasVisiblesParaEncuestador(encuesta, PASOS);

    const idsDelBloque = PASOS.filter(
      (p): p is Extract<Paso, { tipo: 'pregunta' }> =>
        p.tipo === 'pregunta' && p.bloqueId === 'convivencia-y-junta',
    ).map((p) => p.pregunta.id);

    expect(idsDelBloque.length).toBeGreaterThan(0);
    for (const id of idsDelBloque) {
      expect(encuesta.respuestas[id]).toBeDefined(); // se guardaron, van al servidor
      expect(visibles[id]).toBeUndefined(); // pero el encuestador no las ve
    }
  });

  it('el sello no se puede deshacer avanzando y volviendo', () => {
    let encuesta = hastaSellarElBloque();
    encuesta = retroceder(encuesta, PASOS);
    expect(encuesta.bloquesSellados).toContain('convivencia-y-junta');
  });
});
