import { requireOrg } from "@/server/tenancy/context";
import { db } from "@/lib/db";

export const metadata = { title: "Panel — ZENTRA" };

export default async function Dashboard() {
  const ctx = await requireOrg();
  const [accounts, settings] = await Promise.all([
    db.adAccount.count({ where: { organizationId: ctx.organizationId } }),
    db.automationSettings.findUnique({ where: { organizationId: ctx.organizationId } }),
  ]);
  const cards = [
    { label: "Cuentas publicitarias conectadas", value: String(accounts) },
    { label: "Modo de automatización", value: settings?.mode === "MANUAL" ? "Manual" : (settings?.mode ?? "—") },
    { label: "Automatizaciones reales", value: settings?.enabled ? "Activas" : "Desactivadas" },
  ];
  return (
    <div className="animate-rise space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Hola, {ctx.user.name.split(" ")[0]}</h1>
        <p className="text-muted">Bienvenido a ZENTRA. Tu cuenta está lista.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="card p-5">
            <p className="text-sm text-muted">{c.label}</p>
            <p className="mt-2 text-2xl font-semibold">{c.value}</p>
          </div>
        ))}
      </div>
      <div className="card border-dashed p-6">
        <p className="font-semibold">Aún no hay datos publicitarios</p>
        <p className="mt-1 text-sm text-muted">
          Las métricas aparecerán aquí cuando conectes Meta Ads (Fase 3). El panel con datos de demostración llega en la Fase 2.
        </p>
      </div>
    </div>
  );
}
