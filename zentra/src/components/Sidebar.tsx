"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Logo } from "./Logo";

// "soon" = módulo planificado: se muestra como próximamente, sin simular funcionalidad.
const NAV = [
  { href: "/dashboard", label: "Panel", phase: 0 },
  { href: "/ads", label: "Anuncios", phase: 0 },
  { href: "/connections", label: "Conexiones", phase: 0 },
  { href: "/assistant", label: "ZENTRA AI", phase: 0 },
  { href: "/recommendations", label: "Recomendaciones", phase: 0 },
  { href: "/settings/analysis", label: "Criterios de análisis", phase: 0 },
  { href: "/automations", label: "Automatizaciones", phase: 0 },
  { href: "/notifications", label: "Notificaciones", phase: 0 },
  { href: "#", label: "Ventas", phase: 6 },
  { href: "#", label: "Plan y pagos", phase: 6 },
];

export function Sidebar({ orgName, userName, logout, unread = 0 }: { orgName: string; userName: string; logout: () => Promise<void>; unread?: number }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="flex items-center justify-between border-b border-line px-4 py-3 lg:hidden">
        <Logo width={150} />
        <button className="btn btn-ghost" aria-expanded={open} aria-label="Menú" onClick={() => setOpen(!open)}>☰</button>
      </div>
      <aside className={`${open ? "block" : "hidden"} border-b border-line bg-panel p-4 lg:fixed lg:inset-y-0 lg:block lg:w-64 lg:border-b-0 lg:border-r`}>
        <div className="mb-6 hidden lg:block"><Logo width={200} /></div>
        <p className="mb-4 truncate text-xs uppercase tracking-wider text-muted">{orgName}</p>
        <nav className="space-y-1">
          {NAV.map((n) => {
            const active = n.phase === 0 && (path === n.href || path.startsWith(n.href + "/"));
            const base = "flex items-center justify-between rounded-lg px-3 py-2 text-sm";
            return n.phase === 0 ? (
              <Link key={n.label} href={n.href} onClick={() => setOpen(false)} className={`${base} ${active ? "bg-zred/15 text-white" : "text-muted hover:text-white"}`}>{n.label}{n.href === "/notifications" && unread > 0 && <span className="rounded-full bg-zred px-2 text-xs font-semibold text-white">{unread}</span>}</Link>
            ) : (
              <span key={n.label} className={`${base} cursor-not-allowed text-muted/50`}>
                {n.label}<span className="text-[10px] uppercase">Fase {n.phase}</span>
              </span>
            );
          })}
        </nav>
        <div className="mt-8 border-t border-line pt-4 text-sm lg:absolute lg:bottom-4 lg:left-4 lg:right-4">
          <p className="mb-2 truncate text-muted">{userName}</p>
          <form action={logout}><button className="btn btn-ghost w-full">Salir</button></form>
        </div>
      </aside>
    </>
  );
}
