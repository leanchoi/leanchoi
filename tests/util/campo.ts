import 'fake-indexeddb/auto';
import { CuestionarioSchema } from '@/lib/cuestionario';
import type { Cuestionario } from '@/lib/cuestionario';
import { crearBaseCampo } from '@/lib/campo/db';
import type { BaseCampo } from '@/lib/campo/db';
import type { ViviendaLocal } from '@/lib/campo/tipos';
import { CUESTIONARIO_V1 } from './cuestionario';

export const CUESTIONARIO: Cuestionario = CuestionarioSchema.parse(CUESTIONARIO_V1);

let contador = 0;

/** Una base local limpia por test. */
export async function baseDePrueba(): Promise<BaseCampo> {
  contador += 1;
  const base = crearBaseCampo(`prueba-campo-${contador}-${Date.now()}`);
  await base.open();
  return base;
}

export const BARRIO = {
  id: '018f0000-0000-7000-8000-00000000b001',
  slug: '28-de-junio',
  nombre: '28 de Junio',
};

export function viviendaDePrueba(identificador = 'M01-L01'): ViviendaLocal {
  contador += 1;
  return {
    id: `018f0000-0000-7000-8000-0000000v${String(contador).padStart(4, '0')}`,
    barrioId: BARRIO.id,
    barrioSlug: BARRIO.slug,
    identificador,
    estado: 'pendiente',
    intentos: 0,
    agregadaEnCampo: false,
    actualizadaEn: new Date().toISOString(),
  };
}

export const DISPOSITIVO = '018f0000-0000-7000-8000-0000000d0001';
