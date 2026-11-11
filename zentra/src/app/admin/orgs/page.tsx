import { db } from "@/lib/db";
import { dateLong } from "@/lib/format";
import { getAccess } from "@/server/billing/access";
import { orgStatusAction } from "../actions";

export default async function Orgs({ searchParams }: { searchParams: Promise<{ q?: string; msg?: string }> }) {
  const sp = await searchParams; const q = (sp.q ?? "").trim().slice(0, 60);
  const orgs = await db.organization.findMany({ where: q ? { name: { contains: q, mode: "insensitive" } } : {}, orderBy: { createdAt: "desc" }, take: 100,
    include: { _count: { select: { memberships: true, adAccounts: true } }, subscriptions: { orderBy: { createdAt: "desc" }, take: 1 } } });
  const access = await Promise.all(orgs.map((o) => getAccess(o.id)));
  return (
    <div className="space-y-4">
      <form className="flex gap-2"><input name="q" defaultValue={q} placeholder="Buscar empresa…" className="input max-w-xs" /><button className="btn btn-ghost">Buscar</button></form>
      {sp.msg && <p role="status" className="rounded-xl border border-line bg-panel px-4 py-2 text-sm">{sp.msg}</p>}
      <div className="card overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
        <thead className="text-xs text-muted"><tr><th className="p-3 font-normal">Empresa</th><th className="font-normal">País</th><th className="font-normal">Plan</th><th className="font-normal">Acceso</th><th className="font-normal">Usuarios</th><th className="font-normal">Cuentas</th><th className="font-normal">Alta</th><th className="font-normal">Estado</th></tr></thead>
        <tbody>{orgs.map((o, i) => (
          <tr key={o.id} className="border-t border-line"><td className="p-3">{o.name}</td><td>{o.countryCode ?? "—"}</td><td>{o.subscriptions[0]?.planId ?? "—"}</td><td>{access[i].state}</td><td>{o._count.memberships}</td><td>{o._count.adAccounts}</td><td>{dateLong(o.createdAt)}</td>
            <td><form action={orgStatusAction} className="flex items-center gap-2"><input type="hidden" name="id" value={o.id} /><input type="hidden" name="status" value={o.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"} />
              <span className={o.status === "ACTIVE" ? "text-emerald-300" : "text-red-300"}>{o.status === "ACTIVE" ? "Activa" : "Suspendida"}</span><button className="text-xs underline">{o.status === "ACTIVE" ? "Suspender" : "Reactivar"}</button></form></td></tr>))}</tbody></table></div>
    </div>
  );
}
