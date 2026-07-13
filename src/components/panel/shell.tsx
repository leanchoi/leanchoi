import Link from "next/link";
import { logoutAction } from "@/server/actions/auth";

// Shell compartido de los back-offices (master y tenant): sidebar + contenido.
export function PanelShell({
  title,
  items,
  userName,
  accent,
  children,
}: {
  title: string;
  items: { href: string; label: string }[];
  userName: string;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[100dvh] bg-bone">
      <aside className="sticky top-0 hidden h-[100dvh] w-60 shrink-0 flex-col border-r border-ink/8 bg-white px-4 py-6 md:flex">
        <Link href="/" className="px-3 font-display text-xl font-bold text-pine">
          andar<span className="text-amber-burnt">.</span>
        </Link>
        <p className="mt-1 px-3 text-xs text-ink/45">{title}</p>
        <nav className="mt-8 flex flex-1 flex-col gap-1">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-ink/70 transition-colors hover:bg-ink/5 hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-ink/8 pt-4">
          <p className="px-3 text-sm font-medium text-ink">{userName}</p>
          <form action={logoutAction}>
            <button className="mt-1 px-3 text-xs text-ink/50 hover:text-ink" type="submit">
              Cerrar sesión
            </button>
          </form>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* nav mobile */}
        <div className="flex items-center gap-3 overflow-x-auto border-b border-ink/8 bg-white px-4 py-3 md:hidden">
          {items.map((item) => (
            <Link key={item.href} href={item.href} className="whitespace-nowrap text-sm font-medium text-ink/70">
              {item.label}
            </Link>
          ))}
        </div>
        <main className="mx-auto max-w-6xl px-5 py-8 md:px-8">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  intro,
  action,
}: {
  title: string;
  intro?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink md:text-3xl">{title}</h1>
        {intro && <p className="mt-1.5 max-w-xl text-sm text-ink/55">{intro}</p>}
      </div>
      {action}
    </div>
  );
}
