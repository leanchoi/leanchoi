/**
 * Los cinco roles del operativo y qué puede hacer cada uno.
 *
 * La regla que ordena todo: solo `admin` toca el schema `identificada`, y cada vez
 * que lo hace queda registrado en `audit_log` con usuario, momento y motivo.
 */

export const ROLES = ['encuestador', 'coordinador_barrio', 'area', 'conduccion', 'admin'] as const;
export type Rol = (typeof ROLES)[number];

export const ETIQUETA_ROL: Record<Rol, string> = {
  encuestador: 'Encuestador',
  coordinador_barrio: 'Coordinación de barrio',
  area: 'Área',
  conduccion: 'Conducción',
  admin: 'Administración',
};

export type Permiso =
  /** Cargar encuestas y no-respuestas en su barrio asignado. */
  | 'cargar_en_su_barrio'
  /** Ver los agregados de su propio barrio. */
  | 'ver_agregado_barrio'
  /** Ver los agregados de todos los barrios. */
  | 'ver_agregado_todos'
  /** Ver respuestas individuales (nunca con identidad). */
  | 'ver_respuestas_individuales'
  /** Ver y gestionar derivaciones. */
  | 'ver_derivaciones'
  /** Ver la cobertura del operativo. */
  | 'ver_cobertura'
  /** Exportar CSV anonimizado. */
  | 'exportar'
  /** Cruzar el ticket con la identidad del vecino. Siempre auditado. */
  | 'cruzar_identidad'
  /** Administrar usuarios. */
  | 'administrar_usuarios';

const PERMISOS: Record<Rol, readonly Permiso[]> = {
  encuestador: ['cargar_en_su_barrio'],
  coordinador_barrio: ['ver_agregado_barrio', 'ver_cobertura'],
  area: ['ver_agregado_todos', 'ver_cobertura'],
  conduccion: ['ver_agregado_todos', 'ver_derivaciones', 'ver_cobertura', 'exportar'],
  admin: [
    'cargar_en_su_barrio',
    'ver_agregado_barrio',
    'ver_agregado_todos',
    'ver_respuestas_individuales',
    'ver_derivaciones',
    'ver_cobertura',
    'exportar',
    'cruzar_identidad',
    'administrar_usuarios',
  ],
};

export function puede(rol: Rol, permiso: Permiso): boolean {
  return PERMISOS[rol].includes(permiso);
}

export function permisosDe(rol: Rol): readonly Permiso[] {
  return PERMISOS[rol];
}

/**
 * ¿Este rol está limitado a su propio barrio? Encuestador y coordinación de barrio
 * no ven nada de los demás barrios.
 */
export function limitadoASuBarrio(rol: Rol): boolean {
  return rol === 'encuestador' || rol === 'coordinador_barrio';
}
