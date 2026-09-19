/**
 * Crea un usuario del sistema. El primero tiene que ser un `admin` nominal: es el
 * único rol que puede cruzar un ticket con la identidad del vecino, y cada cruce
 * queda auditado con su nombre.
 *
 *   ADMIN_USUARIO=apellido.nombre ADMIN_PASSWORD='...' npm run admin:create
 *   ADMIN_USUARIO=... ADMIN_PASSWORD=... ADMIN_ROL=encuestador ADMIN_BARRIO=28-de-junio npm run admin:create
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { closePool } from '@/db/client';
import { barrios } from '@/db/schema';
import { verificarFortaleza } from '@/lib/auth/password';
import { ROLES } from '@/lib/auth/roles';
import type { Rol } from '@/lib/auth/roles';
import { buscarPorUsuario, crearUsuario } from '@/lib/auth/usuarios';

async function main(): Promise<void> {
  const usuario = process.env.ADMIN_USUARIO?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const nombreVisible = process.env.ADMIN_NOMBRE?.trim() || usuario;
  const rol = (process.env.ADMIN_ROL?.trim() || 'admin') as Rol;
  const barrioSlug = process.env.ADMIN_BARRIO?.trim();

  if (!usuario || !password) {
    console.error('✖ Faltan ADMIN_USUARIO y ADMIN_PASSWORD.');
    console.error(
      '  Ejemplo: ADMIN_USUARIO=perez.ana ADMIN_PASSWORD="$(openssl rand -base64 18)" npm run admin:create',
    );
    process.exit(2);
  }

  if (!ROLES.includes(rol)) {
    console.error(`✖ Rol inválido: ${rol}. Válidos: ${ROLES.join(', ')}.`);
    process.exit(2);
  }

  const problemas = verificarFortaleza(password);
  if (problemas.length > 0) {
    console.error('✖ La contraseña no sirve:');
    for (const problema of problemas) console.error(`  - ${problema}`);
    process.exit(2);
  }

  if (await buscarPorUsuario(usuario)) {
    console.error(`✖ El usuario "${usuario}" ya existe.`);
    process.exit(1);
  }

  let barrioId: string | null = null;
  if (barrioSlug) {
    const [barrio] = await getDb()
      .select({ id: barrios.id })
      .from(barrios)
      .where(eq(barrios.slug, barrioSlug))
      .limit(1);
    if (!barrio) {
      console.error(`✖ No existe el barrio "${barrioSlug}".`);
      process.exit(2);
    }
    barrioId = barrio.id;
  }

  if ((rol === 'encuestador' || rol === 'coordinador_barrio') && !barrioId) {
    console.error(`✖ El rol ${rol} necesita un barrio: pasá ADMIN_BARRIO=<slug>.`);
    process.exit(2);
  }

  const creado = await crearUsuario({
    usuario,
    password,
    nombreVisible: nombreVisible ?? usuario,
    rol,
    barrioId,
  });

  console.log(`✔ Usuario creado: ${creado.usuario} (${creado.rol}).`);
  console.log('  La contraseña no se imprime: es la que pasaste en ADMIN_PASSWORD.');
  if (rol === 'admin') {
    console.log(
      '  Recordá: cada cruce de ticket con identidad que haga queda auditado con su nombre.',
    );
  }
}

main()
  .catch((error: unknown) => {
    console.error('✖ Falló la creación:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closePool());
