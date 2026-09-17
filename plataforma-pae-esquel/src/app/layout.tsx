import type { Metadata } from "next";
import "./globals.css";
import { Shell } from "@/components/Shell";

export const metadata: Metadata = {
  title: "Trocha · Sistema de Gestión del PAE · Esquel",
  description: "Sistema de gestión, trazabilidad e impacto del Programa de Apoyo a la Educación (PAE), Municipalidad de Esquel, Chubut.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-AR">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}