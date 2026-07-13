import Link from "next/link";
import { notFound } from "next/navigation";
import { Lora, Archivo } from "next/font/google";
import { resolveTenant } from "@/lib/tenants";
import { parseSiteConfig, radiusToCss } from "@/lib/site-config";

// Tipografias alternativas de los templates: cada sitio elige su voz.
const clasica = Lora({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-site-display" });
const fuerte = Archivo({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-site-display" });

export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { domain: string };
}) {
  const tenant = await resolveTenant(params.domain);
  if (!tenant) notFound();

  const config = parseSiteConfig(tenant.siteConfig, tenant.name, tenant.tagline);
  const { theme } = config;
  const basePath = `/sites/${params.domain}`;

  const fontClass =
    theme.font === "clasica" ? clasica.variable : theme.font === "fuerte" ? fuerte.variable : "";
  const displayVar =
    theme.font === "moderna" ? "var(--font-display)" : "var(--font-site-display)";

  return (
    <div
      className={`${fontClass} flex min-h-[100dvh] flex-col`}
      style={
        {
          "--site-bg": theme.bg,
          "--site-ink": theme.ink,
          "--site-primary": theme.primary,
          "--site-accent": theme.accent,
          "--site-muted": theme.muted,
          "--site-card": theme.card,
          "--site-radius": radiusToCss(theme.radius),
          "--font-display": displayVar,
          background: theme.bg,
          color: theme.ink,
        } as React.CSSProperties
      }
    >
      <header className="sticky top-0 z-40 border-b border-site-ink/10 bg-site-bg/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-shell items-center justify-between px-5">
          <Link href={basePath} className="font-display text-xl font-bold tracking-tight text-site-ink">
            {tenant.name}
          </Link>
          <nav className="flex items-center gap-5 text-sm font-medium">
            <Link href={`${basePath}#experiencias`} className="text-site-muted transition-colors hover:text-site-ink">
              Experiencias
            </Link>
            {tenant.whatsapp && (
              <a
                href={`https://wa.me/${tenant.whatsapp.replace(/[^0-9]/g, "")}`}
                className="inline-flex h-9 items-center rounded-full bg-site-primary px-5 text-site-bg transition-transform hover:-translate-y-0.5"
              >
                WhatsApp
              </a>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-site-ink/10">
        <div className="mx-auto flex max-w-shell flex-col items-center justify-between gap-4 px-5 py-8 text-sm text-site-muted md:flex-row">
          <p>
            © {new Date().getFullYear()} {tenant.name}
            {tenant.contactEmail && (
              <>
                {" · "}
                <a href={`mailto:${tenant.contactEmail}`} className="underline-offset-4 hover:underline">
                  {tenant.contactEmail}
                </a>
              </>
            )}
          </p>
          <a
            href={process.env.NEXT_PUBLIC_BASE_URL ?? "/"}
            className="text-xs opacity-70 underline-offset-4 hover:underline"
          >
            Parte de la red Andar
          </a>
        </div>
      </footer>
    </div>
  );
}
