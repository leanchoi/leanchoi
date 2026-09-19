import { describe, expect, it } from 'vitest';
import { limitadoASuBarrio, permisosDe, puede, ROLES } from '@/lib/auth/roles';

/**
 * La matriz de permisos escrita como test: si alguien la afloja, se rompe acá.
 */
describe('qué puede hacer cada rol', () => {
  it('el encuestador solo carga en su barrio', () => {
    expect(puede('encuestador', 'cargar_en_su_barrio')).toBe(true);
    expect(puede('encuestador', 'ver_agregado_barrio')).toBe(false);
    expect(puede('encuestador', 'ver_agregado_todos')).toBe(false);
    expect(puede('encuestador', 'cruzar_identidad')).toBe(false);
    expect(puede('encuestador', 'exportar')).toBe(false);
  });

  it('la coordinación de barrio ve agregados de SU barrio, no respuestas individuales', () => {
    expect(puede('coordinador_barrio', 'ver_agregado_barrio')).toBe(true);
    expect(puede('coordinador_barrio', 'ver_respuestas_individuales')).toBe(false);
    expect(puede('coordinador_barrio', 'ver_agregado_todos')).toBe(false);
    expect(puede('coordinador_barrio', 'cruzar_identidad')).toBe(false);
  });

  it('el área ve todos los barrios pero nada individual ni identidades', () => {
    expect(puede('area', 'ver_agregado_todos')).toBe(true);
    expect(puede('area', 'ver_respuestas_individuales')).toBe(false);
    expect(puede('area', 'cruzar_identidad')).toBe(false);
  });

  it('conducción ve todo agregado y las derivaciones, pero no identidades', () => {
    expect(puede('conduccion', 'ver_agregado_todos')).toBe(true);
    expect(puede('conduccion', 'ver_derivaciones')).toBe(true);
    expect(puede('conduccion', 'exportar')).toBe(true);
    expect(puede('conduccion', 'cruzar_identidad')).toBe(false);
  });

  it('SOLO admin puede cruzar el ticket con la identidad', () => {
    const conCruce = ROLES.filter((rol) => puede(rol, 'cruzar_identidad'));
    expect(conCruce).toEqual(['admin']);
  });

  it('encuestador y coordinación están atados a su barrio', () => {
    expect(limitadoASuBarrio('encuestador')).toBe(true);
    expect(limitadoASuBarrio('coordinador_barrio')).toBe(true);
    expect(limitadoASuBarrio('area')).toBe(false);
    expect(limitadoASuBarrio('conduccion')).toBe(false);
    expect(limitadoASuBarrio('admin')).toBe(false);
  });

  it('ningún rol tiene permisos repetidos ni inventados', () => {
    for (const rol of ROLES) {
      const permisos = permisosDe(rol);
      expect(new Set(permisos).size).toBe(permisos.length);
    }
  });
});
