import { db } from "@/lib/db";
import { requireOrg } from "@/server/tenancy/context";
import { markReadAction } from "./actions";

export const metadata = { title: "Notificaciones — ZENTRA" };
const SEV: Record<string, [string, string]> = { important: ["Importante", "border-zred/50 text-red-300"], warning: ["Atención", "border-amber-500/40 text-amber-300"], info: ["Informativo", "border-line text-muted"] };

export default async function Notifications() {
  const ctx = await requireOrg();
  const items = await db.notification.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { createdAt: "desc" }, take: 60 });
  const unread = items.filter((n) => !n.readAt).length;
  return (
    <div className="animate-rise max-w-3xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Notificaciones</h1><p className="text-sm text-muted">Qué pasó y qué te recomendamos hacer.</p></div>
        {unread > 0 && <form action={markReadAction}><input type="hidden" name="id" value="" /><button className="btn btn-ghost !py-1.5 text-sm">Marcar todas como leídas</button></form>}
      </div>
      {items.length === 0 && <p className="card p-6 text-sm text-muted">No tienes notificaciones.</p>}
      {items.map((n) => {
        const [label, cls] = SEV[n.severity] ?? SEV.info;
        return (
          <article key={n.id} className={`card p-4 ${n.readAt ? "opacity-70" : ""}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2 py-0.5 text-xs ${cls}`}>{label}</span>
              <h2 className="font-semibold">{n.title}</h2>
              {!n.readAt && <span className="h-2 w-2 rounded-full bg-zred" aria-label="Sin leer" />}
            </div>
            <p className="mt-2 text-sm">{n.body}</p>
            {n.recommendation && <p className="mt-2 text-sm">💡 <span className="text-muted">Qué hacer:</span> {n.recommendation}</p>}
            <div className="mt-3 flex items-center justify-between text-xs text-muted">
              <span>{n.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC{n.emailedAt ? " · enviada por correo" : ""}</span>
              {!n.readAt && <form action={markReadAction}><input type="hidden" name="id" value={n.id} /><button className="underline hover:text-white">Marcar como leída</button></form>}
            </div>
          </article>
        );
      })}
    </div>
  );
}
