/**
 * Barrios de Esquel para el seed inicial.
 *
 * TODO: validar contra el listado oficial de sedes vecinales del municipio.
 * Este listado PUEDE ESTAR INCOMPLETO: es el punto de partida para que la
 * Dirección de Juntas Vecinales lo corrija, no una fuente oficial.
 */
export type BarrioSemilla = { nombre: string; slug: string };

export const BARRIOS_ESQUEL: readonly BarrioSemilla[] = [
  { nombre: '28 de Junio', slug: '28-de-junio' },
  { nombre: 'Ceferino', slug: 'ceferino' },
  { nombre: 'Estación', slug: 'estacion' },
  { nombre: 'Sargento Cabral', slug: 'sargento-cabral' },
  { nombre: 'Bella Vista', slug: 'bella-vista' },
  { nombre: 'Malvinas', slug: 'malvinas' },
  { nombre: 'Los Sauces', slug: 'los-sauces' },
  { nombre: 'Matadero', slug: 'matadero' },
  { nombre: 'Buenos Aires', slug: 'buenos-aires' },
  { nombre: 'Badén', slug: 'baden' },
  { nombre: 'Don Bosco', slug: 'don-bosco' },
  { nombre: 'Villa Ayelén', slug: 'villa-ayelen' },
  { nombre: 'Lennart Englund', slug: 'lennart-englund' },
  { nombre: 'Parque', slug: 'parque' },
  { nombre: 'INTA', slug: 'inta' },
] as const;
