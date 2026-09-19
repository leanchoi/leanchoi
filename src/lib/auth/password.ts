import bcrypt from 'bcryptjs';

/**
 * Contraseñas del personal municipal. Auth propia: ni Google, ni Facebook, ni
 * ningún proveedor externo mirando quién entra al sistema.
 */

const COSTO = 12;

export async function hashearPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COSTO);
}

export async function verificarPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

export type ProblemaPassword = string;

/** Requisitos mínimos. Cortos y claros: no sirve una política que nadie cumple. */
export function verificarFortaleza(password: string): ProblemaPassword[] {
  const problemas: ProblemaPassword[] = [];
  if (password.length < 10) problemas.push('Tiene que tener al menos 10 caracteres.');
  if (!/[a-zA-Z]/.test(password)) problemas.push('Tiene que tener alguna letra.');
  if (!/[0-9]/.test(password)) problemas.push('Tiene que tener algún número.');
  if (/^(12345|password|contrasena|contraseña|qwerty|esquel)/i.test(password)) {
    problemas.push('Es una contraseña demasiado obvia.');
  }
  return problemas;
}
