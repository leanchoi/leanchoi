"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";

const NAV_GROUPS = [
  {
    grupo: "Conducción",
    items: [
      {
        href: "/panel",
        label: "Panel de conducción",
        icon: (
          <path d="M3 3h7v7H3zM14 3h7v4h-7zM14 10h7v11h-7zM3 13h7v8H3z" />
        ),
      },
      {
        href: "/territorio",
        label: "Mesa de territorio",
        icon: (
          <path d="M9 3L3 6v15l6-3 6 3 6-3V3l-6 3-6-3zM9 3v15M15 6v15" />
        ),
      },
    ],
  },
  {
    grupo: "Ciudadanía",
    items: [
      {
        href: "/estudiante",
        label: "Portal del estudiante",
        icon: (
          <path d="M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0" />
        ),
      },
      {
        href: "/transparencia",
        label: "Portal público",
        icon: (
          <path d="M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3a15 15 0 010 18 15 15 0 010-18z" />
        ),
      },
    ],
  },
  {
    grupo: "Proyecto",
    items: [
      {
        href: "/",
        label: "Inicio del sistema",
        icon: (
          <path d="M3 10l9-7 9 7v10a1 1 0 01-1 1h-5v-7H9v7H4a1 1 0 01-1-1z" />
        ),
      },
    ],
  },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="shell">
      <aside className="rail" aria-label="Navegación principal">
        <div className="brand">
          <Link href="/" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="brand-mark">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M2 19h20M4 19V9l8-6 8 6v10"
                  stroke="var(--ink-1)"
                  strokeWidth="1.7"
                  strokeLinejoin="round"
                />
                <path
                  d="M7 19v-5h4v5M14 19v-7h3v7"
                  stroke="var(--accent)"
                  strokeWidth="1.7"
                  strokeLinejoin="round"
                />
              </svg>
              <div>
                <div className="brand-name">Trocha</div>
                <div className="brand-sub">Gestión PAE · Esquel</div>
              </div>
            </div>
          </Link>
        </div>

        <nav className="nav" aria-label="Secciones">
          {NAV_GROUPS.map((g) => (
            <div key={g.grupo} className="nav-group">
              <span className="rotulo">{g.grupo}</span>
              {g.items.map((i) => {
                const isActive = pathname === i.href;
                return (
                  <Link
                    key={i.href}
                    href={i.href}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      {i.icon}
                    </svg>
                    <span>{i.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div style={{ padding: "14px 20px", borderTop: "1px solid var(--grid)" }}>
          <div className="row-between mb-2">
            <span className="demo-badge">Datos demo</span>
            <ThemeToggle />
          </div>
          <p className="tiny muted" style={{ margin: "4px 0 0" }}>
            Cifras de demostración identificadas con bandera esDemo.
          </p>
        </div>
      </aside>

      <div className="main">
        {children}
      </div>
    </div>
  );
}