import { NextRequest, NextResponse } from "next/server";

// Multi-tenancy por dominio:
//  - El dominio master sirve el marketplace consolidador y los paneles.
//  - Cualquier otro host (dominio propio del tenant o subdominio de la
//    plataforma) se reescribe a /sites/<host>/..., donde el App Router
//    resuelve el tenant contra la base de datos.
export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const host = (req.headers.get("host") ?? "").toLowerCase();

  const masterDomain = (process.env.MASTER_DOMAIN ?? "localhost:3000").toLowerCase();
  const bareHost = host.split(":")[0];
  const isMaster =
    host === masterDomain ||
    bareHost === masterDomain.split(":")[0] ||
    // en desarrollo, cualquier localhost sin subdominio es el master
    bareHost === "localhost" ||
    bareHost === "127.0.0.1";
  if (isMaster) {
    return NextResponse.next();
  }

  // rutas compartidas que nunca se reescriben
  if (
    url.pathname.startsWith("/api") ||
    url.pathname.startsWith("/_next") ||
    url.pathname.startsWith("/sites") ||
    url.pathname === "/favicon.ico" ||
    url.pathname === "/robots.txt"
  ) {
    return NextResponse.next();
  }

  const rewritten = url.clone();
  rewritten.pathname = `/sites/${host}${url.pathname === "/" ? "" : url.pathname}`;
  return NextResponse.rewrite(rewritten);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
