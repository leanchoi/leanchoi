import Link from "next/link";
import { Button } from "@/components/ui";
import { getSession } from "@/lib/auth";

// Shell del marketplace master: navegacion y pie compartidos.
export default async function MasterLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const panelHref = session ? (session.role === "MASTER" ? "/master" : "/panel") : "/login";

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="sticky top-0 z-40 border-b border-ink/8 bg-bone/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-shell items-center justify-between px-5">
          <Link href="/" className="font-display text-2xl font-bold tracking-tight text-pine">
            andar<span className="text-amber-burnt">.</span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm font-medium text-ink/70 md:flex">
            <Link href="/experiencias" className="hover:text-ink">Experiencias</Link>
            <Link href="/productos" className="hover:text-ink">Productos</Link>
            <Link href="/operadores" className="hover:text-ink">Operadores</Link>
          </nav>
          <div className="flex items-center gap-3">
            <Button href={panelHref} variant="outline" size="sm">
              {session ? "Mi panel" : "Ingresar"}
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-ink/8 bg-white">
        <div className="mx-auto grid max-w-shell gap-10 px-5 py-14 md:grid-cols-4">
          <div className="md:col-span-2">
            <p className="font-display text-xl font-bold text-pine">andar<span className="text-amber-burnt">.</span></p>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-ink/60">
              Experiencias turísticas y productos regionales, vendidos por la gente que los hace.
              Cada operador cobra directo en su cuenta.
            </p>
          </div>
          <div className="text-sm">
            <p className="font-semibold text-ink">Explorar</p>
            <ul className="mt-3 space-y-2 text-ink/60">
              <li><Link href="/experiencias" className="hover:text-ink">Experiencias</Link></li>
              <li><Link href="/productos" className="hover:text-ink">Productos</Link></li>
              <li><Link href="/operadores" className="hover:text-ink">Operadores</Link></li>
            </ul>
          </div>
          <div className="text-sm">
            <p className="font-semibold text-ink">Operadores</p>
            <ul className="mt-3 space-y-2 text-ink/60">
              <li><Link href="/login" className="hover:text-ink">Acceso al panel</Link></li>
              <li><Link href="/operadores#sumate" className="hover:text-ink">Sumá tu emprendimiento</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-ink/8 py-5 text-center text-xs text-ink/40">
          © {new Date().getFullYear()} Andar. Hecho en Argentina.
        </div>
      </footer>
    </div>
  );
}
