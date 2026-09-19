import { eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { getDb } from '@/db';
import { usuarios } from '@/db/schema';
import { hashearPassword } from './password';
import type { Rol } from './roles';

export type UsuarioSesion = {
  id: string;
  usuario: string;
  nombreVisible: string;
  rol: Rol;
  barrioId: string | null;
  area: string | null;
};

function aSesion(fila: typeof usuarios.$inferSelect): UsuarioSesion {
  return {
    id: fila.id,
    usuario: fila.usuario,
    nombreVisible: fila.nombreVisible,
    rol: fila.rol as Rol,
    barrioId: fila.barrioId,
    area: fila.area,
  };
}

export async function buscarPorUsuario(nombre: string) {
  const [fila] = await getDb()
    .select()
    .from(usuarios)
    .where(eq(usuarios.usuario, nombre.trim().toLowerCase()))
    .limit(1);
  return fila;
}

/** Usuario activo por id. Devuelve null si lo desactivaron: la sesión cae sola. */
export async function usuarioActivo(id: string): Promise<UsuarioSesion | null> {
  const [fila] = await getDb().select().from(usuarios).where(eq(usuarios.id, id)).limit(1);
  if (!fila || !fila.activo) return null;
  return aSesion(fila);
}

export async function registrarAcceso(id: string): Promise<void> {
  await getDb().update(usuarios).set({ ultimoAcceso: new Date() }).where(eq(usuarios.id, id));
}

export type NuevoUsuario = {
  usuario: string;
  password: string;
  nombreVisible: string;
  rol: Rol;
  barrioId?: string | null;
  area?: string | null;
};

export async function crearUsuario(datos: NuevoUsuario): Promise<UsuarioSesion> {
  const [fila] = await getDb()
    .insert(usuarios)
    .values({
      id: uuidv7(),
      usuario: datos.usuario.trim().toLowerCase(),
      hashPassword: await hashearPassword(datos.password),
      nombreVisible: datos.nombreVisible.trim(),
      rol: datos.rol,
      barrioId: datos.barrioId ?? null,
      area: datos.area ?? null,
    })
    .returning();

  if (!fila) throw new Error('No se pudo crear el usuario.');
  return aSesion(fila);
}

export { aSesion };
