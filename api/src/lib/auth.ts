import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * Bearer token guard for admin routes.
 *
 * v1: single shared token from env (ADMIN_TOKEN). The frontend admin panel
 * sends it as `Authorization: Bearer <token>`.
 *
 * TODO: upgrade to real multi-user auth (users table + hashed passwords +
 * sessions/JWT + roles). Keep this middleware as the single enforcement point
 * so the swap is localized.
 */
export async function requireAdmin(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    reply.internalServerError("ADMIN_TOKEN no configurado en el servidor");
    return;
  }

  const header = req.headers.authorization ?? "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token || token !== expected) {
    reply.unauthorized("Token de administrador inválido o ausente");
    return;
  }
}
