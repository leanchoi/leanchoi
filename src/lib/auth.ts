import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { db } from "./db";

const COOKIE = "andar_session";
const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET ?? "dev-secret-cambiar");

export type Session = {
  userId: string;
  role: "MASTER" | "TENANT_ADMIN";
  tenantId: string | null;
  name: string;
};

export async function createSession(session: Session) {
  const token = await new SignJWT(session)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
  cookies().set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
}

export async function getSession(): Promise<Session | null> {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as Session;
  } catch {
    return null;
  }
}

export function destroySession() {
  cookies().delete(COOKIE);
}

export async function login(email: string, password: string): Promise<Session | null> {
  const user = await db.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;
  const session: Session = {
    userId: user.id,
    role: user.role,
    tenantId: user.tenantId,
    name: user.name,
  };
  await createSession(session);
  return session;
}

export async function requireMaster(): Promise<Session> {
  const s = await getSession();
  if (!s || s.role !== "MASTER") throw new Error("UNAUTHORIZED");
  return s;
}

export async function requireTenant(): Promise<Session & { tenantId: string }> {
  const s = await getSession();
  if (!s || s.role !== "TENANT_ADMIN" || !s.tenantId) throw new Error("UNAUTHORIZED");
  return s as Session & { tenantId: string };
}
