/**
 * Crea el primer usuario con rol `admin` (único rol con acceso al schema
 * identificada, siempre auditado).
 *
 *   ADMIN_USUARIO=... ADMIN_PASSWORD=... npm run admin:create
 */
import 'dotenv/config';

async function main(): Promise<void> {
  // TODO(fase 4): crear el usuario contra analitica.usuarios con hash bcrypt.
  console.error(
    '✖ Todavía no disponible: la creación de usuarios llega en la fase 4 (auth y roles).',
  );
  process.exit(1);
}

void main();
