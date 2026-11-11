import { money } from "@/lib/format";
import { adminOverview } from "@/server/admin/service";

export default async function AdminHome() {
  const o = await adminOverview();
  const stat = (l: string, v: string | number) => <div className="card p-4"><p className="text-xs text-muted">{l}</p><p className="mt-1 text-2xl font-semibold">{v}</p></div>;
  return (
    <div className="space-y-6">
      <p className="text-xs text-muted">Solo métricas agregadas: este panel no muestra datos publicitarios ni credenciales de los clientes.</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stat("Usuarios", o.users)}{stat("Empresas", o.orgs)}{stat("En prueba", o.subscriptions.TRIALING ?? 0)}{stat("Suscripciones activas", o.subscriptions.ACTIVE ?? 0)}
        {stat("En mora", o.subscriptions.PAST_DUE ?? 0)}{stat("Vencidas", o.subscriptions.EXPIRED ?? 0)}{stat("Pagos fallidos (30 d)", o.failedPayments)}{stat("Acciones fallidas (30 d)", o.failedActions)}
      </div>
      <section className="card p-5"><h2 className="mb-2 font-semibold">Ingresos cobrados (30 días)</h2>
        {o.revenue30d.length === 0 ? <p className="text-sm text-muted">Sin pagos.</p> : <ul className="space-y-1 text-sm">{o.revenue30d.map((r) => <li key={`${r.currency}${r.simulated}`}>{money(r.amountMinor, r.currency)} · {r.count} pago(s) {r.simulated && <span className="rounded border border-violet-500/50 px-1.5 text-xs text-violet-300">SIMULADO</span>}</li>)}</ul>}</section>
      <section className="card p-5"><h2 className="mb-2 font-semibold">Cuentas con problemas de conexión</h2>
        {o.erroredAccounts.length === 0 ? <p className="text-sm text-muted">Ninguna.</p> : <ul className="space-y-1 text-sm">{o.erroredAccounts.map((a) => <li key={a.id}>{a.name} · <span className="text-amber-300">{a.status}</span> · <span className="text-muted">{a.lastError ?? "sin detalle"}</span></li>)}</ul>}</section>
      <section className="card p-5"><h2 className="mb-2 font-semibold">Automatizaciones activas</h2>
        {o.automations.length === 0 ? <p className="text-sm text-muted">Ninguna organización con automatizaciones activas.</p> : <ul className="space-y-1 text-sm">{o.automations.map((a) => <li key={a.organizationId}>{a.organization.name} · {a.mode} · {a.emergencyStop ? "⛔ emergencia" : a.dryRun ? "simulación" : <strong className="text-amber-300">REAL</strong>}</li>)}</ul>}</section>
    </div>
  );
}
