import { db } from "@/lib/db";
import { dateLong } from "@/lib/format";
import { userStatusAction } from "../actions";

export default async function Users({ searchParams }: { searchParams: Promise<{ q?: string; msg?: string }> }) {
  const sp = await searchParams; const q = (sp.q ?? "").trim().slice(0, 80);
  const users = await db.user.findMany({ where: q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : {}, orderBy: { createdAt: "desc" }, take: 100,
    select: { id: true, email: true, name: true, status: true, platformRole: true, countryCode: true, createdAt: true, memberships: { select: { role: true, organization: { select: { name: true } } } } } });
  return (
    <div className="space-y-4">
      <form className="flex gap-2"><input name="q" defaultValue={q} placeholder="Buscar por correo o nombre…" className="input max-w-xs" /><button className="btn btn-ghost">Buscar</button></form>
      {sp.msg && <p role="status" className="rounded-xl border border-line bg-panel px-4 py-2 text-sm">{sp.msg}</p>}
      <div className="card overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm">
        <thead className="text-xs text-muted"><tr><th className="p-3 font-normal">Usuario</th><th className="font-normal">Empresas</th><th className="font-normal">País</th><th className="font-normal">Alta</th><th className="font-normal">Estado</th></tr></thead>
        <tbody>{users.map((u) => (
          <tr key={u.id} className="border-t border-line"><td className="p-3">{u.name}<br /><span className="text-xs text-muted">{u.email}{u.platformRole === "SUPERADMIN" ? " · propietario" : ""}</span></td>
            <td>{u.memberships.map((m) => `${m.organization.name} (${m.role})`).join(", ") || "—"}</td><td>{u.countryCode ?? "—"}</td><td>{dateLong(u.createdAt)}</td>
            <td>{u.platformRole === "SUPERADMIN" ? <span className="text-muted">—</span> : <form action={userStatusAction} className="flex items-center gap-2"><input type="hidden" name="id" value={u.id} /><input type="hidden" name="status" value={u.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"} />
              <span className={u.status === "ACTIVE" ? "text-emerald-300" : "text-red-300"}>{u.status === "ACTIVE" ? "Activo" : "Suspendido"}</span><button className="text-xs underline">{u.status === "ACTIVE" ? "Suspender" : "Reactivar"}</button></form>}</td></tr>))}</tbody></table></div>
    </div>
  );
}
