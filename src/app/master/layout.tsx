import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { PanelShell } from "@/components/panel/shell";

const NAV = [
  { href: "/master", label: "Insights" },
  { href: "/master/operadores", label: "Páginas independientes" },
  { href: "/master/inventario", label: "Inventario global" },
  { href: "/master/pedidos", label: "Pedidos" },
  { href: "/master/integraciones", label: "Integraciones OTA" },
];

export default async function MasterLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "MASTER") redirect("/panel");

  return (
    <PanelShell title="Administración master" items={NAV} userName={session.name}>
      {children}
    </PanelShell>
  );
}
