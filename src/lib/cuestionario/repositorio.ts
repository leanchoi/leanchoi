import { desc, eq, isNotNull } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { getDb } from '@/db';
import { cuestionarios } from '@/db/schema';
import { CuestionarioSchema, segundosTotales } from './esquema';
import type { Cuestionario } from './esquema';
import { describirProblemas, validarParaPublicar } from './publicacion';

export type VersionPublicada = {
  version: number;
  publicadoEn: Date;
  changelog: string;
  segundosTotales: number;
  consentimientoVersion: string;
  definicion: Cuestionario;
  /** El JSON tal cual se cargó, con los comentarios de quien lo editó. */
  definicionCruda: unknown;
};

export type ResumenVersion = {
  version: number;
  publicadoEn: Date | null;
  changelog: string;
  segundosTotales: number;
};

export class CuestionarioInvalido extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'CuestionarioInvalido';
  }
}

function parsear(definicionCruda: unknown, version: number): Cuestionario {
  const parseo = CuestionarioSchema.safeParse(definicionCruda);
  if (!parseo.success) {
    throw new CuestionarioInvalido(
      `La versión ${version} guardada en la base no valida contra el esquema vigente.`,
    );
  }
  return parseo.data;
}

/** La versión vigente: la más alta que esté publicada. */
export async function obtenerVigente(): Promise<VersionPublicada | null> {
  const [fila] = await getDb()
    .select()
    .from(cuestionarios)
    .where(isNotNull(cuestionarios.publicadoEn))
    .orderBy(desc(cuestionarios.version))
    .limit(1);

  if (!fila || !fila.publicadoEn) return null;

  return {
    version: fila.version,
    publicadoEn: fila.publicadoEn,
    changelog: fila.changelog,
    segundosTotales: fila.segundosTotales,
    consentimientoVersion: fila.consentimientoVersion,
    definicion: parsear(fila.definicion, fila.version),
    definicionCruda: fila.definicion,
  };
}

/** Todas las versiones, de la más nueva a la más vieja. Es el changelog público. */
export async function listarVersiones(): Promise<ResumenVersion[]> {
  return getDb()
    .select({
      version: cuestionarios.version,
      publicadoEn: cuestionarios.publicadoEn,
      changelog: cuestionarios.changelog,
      segundosTotales: cuestionarios.segundosTotales,
    })
    .from(cuestionarios)
    .orderBy(desc(cuestionarios.version));
}

export async function obtenerVersion(version: number): Promise<VersionPublicada | null> {
  const [fila] = await getDb()
    .select()
    .from(cuestionarios)
    .where(eq(cuestionarios.version, version))
    .limit(1);
  if (!fila || !fila.publicadoEn) return null;
  return {
    version: fila.version,
    publicadoEn: fila.publicadoEn,
    changelog: fila.changelog,
    segundosTotales: fila.segundosTotales,
    consentimientoVersion: fila.consentimientoVersion,
    definicion: parsear(fila.definicion, fila.version),
    definicionCruda: fila.definicion,
  };
}

export type ResultadoPublicacion = {
  version: number;
  segundosTotales: number;
  advertencias: string[];
};

/**
 * Publica una versión nueva. Valida contra todas las reglas y, si ya hay una
 * versión vigente, compara el núcleo inmutable contra ella. Si algo falla, no
 * escribe nada y lanza con el detalle completo.
 */
export async function publicarCuestionario(
  definicionCruda: unknown,
): Promise<ResultadoPublicacion> {
  const vigente = await obtenerVigente();
  const validacion = validarParaPublicar(definicionCruda, vigente?.definicion ?? null);

  if (!validacion.ok) {
    throw new CuestionarioInvalido(
      `No se puede publicar el cuestionario:\n${describirProblemas(validacion.problemas)}`,
    );
  }

  const { cuestionario } = validacion;
  const [fila] = await getDb()
    .insert(cuestionarios)
    .values({
      id: uuidv7(),
      version: cuestionario.version,
      definicion: definicionCruda,
      consentimientoVersion: cuestionario.consentimiento.version,
      segundosTotales: segundosTotales(cuestionario),
      changelog: cuestionario.changelog,
      publicadoEn: new Date(),
    })
    .onConflictDoNothing({ target: cuestionarios.version })
    .returning({ version: cuestionarios.version });

  if (!fila) {
    throw new CuestionarioInvalido(
      `La versión ${cuestionario.version} ya existe. Subí el número de versión en el JSON.`,
    );
  }

  return {
    version: fila.version,
    segundosTotales: validacion.segundosTotales,
    advertencias: validacion.advertencias,
  };
}
