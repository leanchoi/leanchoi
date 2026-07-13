import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { PanelShell } from "@/components/panel/shell";

const NAV = [
  { href: "/panel", label: "Resumen" },
  { href: "/panel/listados", label: "Experiencias y productos" },
  { href: "/panel/disponibilidad", label: "Disponibilidad" },
  { href: "/panel/pedidos", label: "Pedidos" },
  { href: "/panel/sitio", label: "Mi sitio" },
  { href: "/panel/pagos", label: "Pagos" },
];

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "MASTER") redirect("/master");

  return (
    <PanelShell title="Panel del operador" items={NAV} userName={session.name}>
      {children}
    </PanelShell>
  );
}
