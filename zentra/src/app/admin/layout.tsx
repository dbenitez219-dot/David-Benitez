import Link from "next/link";
import { Logo } from "@/components/Logo";
import { requireSuperAdmin } from "@/server/tenancy/context";

export const metadata = { title: "Administración — ZENTRA", robots: { index: false, follow: false } };

// Zona privada de los propietarios de ZENTRA. Los demás usuarios reciben 404.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireSuperAdmin();
  const nav = [["/admin", "Resumen"], ["/admin/orgs", "Empresas"], ["/admin/users", "Usuarios"], ["/admin/plans", "Planes y precios"], ["/admin/payments", "Pagos"]];
  return (
    <div className="mx-auto max-w-6xl px-5 py-6">
      <header className="mb-6 flex flex-wrap items-center gap-4 border-b border-line pb-4">
        <Logo width={150} />
        <span className="rounded border border-zred/50 px-2 py-0.5 text-xs font-bold uppercase text-zred">Administración</span>
        <nav className="flex flex-wrap gap-1 text-sm">{nav.map(([h, l]) => <Link key={h} href={h} className="rounded-lg px-3 py-1.5 text-muted hover:bg-panel hover:text-white">{l}</Link>)}</nav>
        <Link href="/dashboard" className="ml-auto text-sm text-muted underline">Volver a la app</Link>
      </header>
      {children}
    </div>
  );
}
