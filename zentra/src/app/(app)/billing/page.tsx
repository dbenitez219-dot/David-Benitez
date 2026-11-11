import Link from "next/link";
import { db } from "@/lib/db";
import { dateLong, money } from "@/lib/format";
import { getAccess } from "@/server/billing/access";
import { PLAN_CATALOG, PLAN_IDS, priceFor } from "@/server/billing/plans";
import { providerFor } from "@/server/billing/providers";
import { hasRole, requireOrg } from "@/server/tenancy/context";
import { cancelAction, resumeAction, startTrialAction } from "./actions";

export const metadata = { title: "Plan y pagos — ZENTRA" };
const STATE: Record<string, [string, string]> = {
  trial: ["Prueba gratuita", "text-sky-300"], active: ["Suscripción activa", "text-emerald-300"], past_due: ["Pago pendiente (reintentando)", "text-amber-300"],
  expired: ["Suscripción inactiva", "text-red-300"], none: ["Sin suscripción", "text-muted"],
};
const PAY: Record<string, [string, string]> = { SUCCEEDED: ["Pagado", "text-emerald-300"], PENDING: ["Pendiente", "text-amber-300"], FAILED: ["Fallido", "text-red-300"], REFUNDED: ["Reembolsado", "text-muted"] };
const KIND: Record<string, string> = { INITIAL: "Activación", RENEWAL: "Renovación automática", MANUAL_RENEWAL: "Renovación manual", CHANGE: "Cambio de plan" };

export default async function Billing({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const ctx = await requireOrg();
  const { msg } = await searchParams;
  const admin = hasRole(ctx.role, "ADMIN");
  const [access, payments, sub] = await Promise.all([
    getAccess(ctx.organizationId),
    db.payment.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.subscription.findFirst({ where: { organizationId: ctx.organizationId }, orderBy: { createdAt: "desc" } }),
  ]);
  const prices = await Promise.all(PLAN_IDS.map((id) => priceFor(id, ctx.organization.countryCode)));
  const [stateLabel, stateColor] = STATE[access.state];
  const provider = prices[0] ? providerFor(ctx.organization.countryCode, prices[0].currency) : null;
  const canceling = access.cancelAtPeriodEnd;

  return (
    <div className="animate-rise max-w-5xl space-y-6">
      <div><h1 className="text-2xl font-bold">Plan y pagos</h1>
        <p className="text-sm text-muted">La suscripción a ZENTRA es independiente de lo que inviertes en publicidad (eso lo pagas directamente a Meta). Nunca cobramos sin tu autorización.</p></div>
      {msg && <p role="status" className="rounded-xl border border-line bg-panel px-4 py-2 text-sm">{msg}</p>}
      {provider?.simulated && <p role="alert" className="rounded-xl border border-violet-500/50 bg-violet-500/10 px-4 py-2 text-sm"><strong>PAGOS SIMULADOS.</strong> Todavía no hay un proveedor de pago real conectado: los pagos son de prueba y no cobran nada.</p>}

      <section className="card p-5">
        <p className={`text-lg font-semibold ${stateColor}`}>{stateLabel}{access.planId ? ` · Plan ${PLAN_CATALOG[access.planId].name}` : ""}</p>
        <ul className="mt-2 space-y-1 text-sm text-muted">
          {access.state === "trial" && <li>Te quedan {access.daysLeft} día(s) de prueba (hasta el {dateLong(access.trialEndsAt!)}). No se cobra nada automáticamente al terminar.</li>}
          {(access.state === "active" || access.state === "past_due") && access.periodEnd && <li>{canceling ? "Acceso hasta" : "Próxima renovación"}: {dateLong(access.periodEnd)}{!canceling && sub && (sub.autoRenew ? " · cobro automático autorizado" : " · sin cobro automático: renueva tú antes de esa fecha")}</li>}
          {access.state === "past_due" && sub?.nextRetryAt && <li>No pudimos cobrar la renovación. Próximo intento: {dateLong(sub.nextRetryAt)}. Mientras tanto conservas el acceso.</li>}
          {(access.state === "expired" || access.state === "none") && <li>Tus datos están a salvo. Las funciones premium (sincronización, automatizaciones, IA, ventas) están limitadas hasta que actives un plan.</li>}
          {canceling && <li>Cancelaste tu suscripción: no se renovará.</li>}
        </ul>
        {admin && (access.state === "trial" || access.state === "active" || access.state === "past_due") && (
          <div className="mt-3">{canceling
            ? <form action={resumeAction}><button className="btn btn-ghost !py-1.5 text-sm">Deshacer cancelación</button></form>
            : <form action={cancelAction}><button className="btn btn-ghost !py-1.5 text-sm">Cancelar suscripción</button></form>}</div>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {PLAN_IDS.map((id, i) => {
          const p = PLAN_CATALOG[id], price = prices[i], current = access.planId === id && (access.state === "active" || access.state === "trial" || access.state === "past_due");
          return (
            <article key={id} className={`card flex flex-col p-5 ${current ? "border-zred" : ""}`}>
              <h2 className="text-lg font-bold">{p.name} {current && <span className="ml-1 rounded-full border border-zred/50 px-2 py-0.5 text-xs font-normal text-red-300">Tu plan</span>}</h2>
              <p className="text-sm text-muted">{p.description}</p>
              <p className="mt-3 text-2xl font-bold">{price ? money(price.amountMinor, price.currency) : "—"}<span className="text-sm font-normal text-muted">{price ? " /mes" : ""}</span></p>
              {price ? <p className="text-xs text-muted">{price.taxIncluded ? "Impuestos incluidos" : "Más impuestos"}{price.taxPercent ? ` (${Number(price.taxPercent)}%)` : ""}</p>
                : <p className="text-xs text-amber-300">Aún no hay precio definido para tu país.</p>}
              <ul className="mt-3 flex-1 space-y-1 text-sm">{p.highlights.map((h) => <li key={h}>✓ {h}</li>)}</ul>
              {admin && (
                <div className="mt-4 space-y-2">
                  {access.state === "none" && !access.trialUsed && <form action={startTrialAction}><input type="hidden" name="plan" value={id} /><button className="btn btn-ghost w-full">Iniciar prueba gratis (7 días)</button></form>}
                  {price && <Link href={`/billing/checkout?plan=${id}`} className="btn w-full">{current && access.state === "active" ? "Renovar" : current ? "Activar este plan" : "Elegir este plan"}</Link>}
                </div>
              )}
            </article>
          );
        })}
      </section>

      <section className="card p-5">
        <h2 className="mb-3 font-semibold">Historial de pagos</h2>
        {payments.length === 0 ? <p className="text-sm text-muted">Todavía no hay pagos.</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-xs text-muted"><tr><th className="py-2 font-normal">Fecha</th><th className="font-normal">Concepto</th><th className="font-normal">Importe</th><th className="font-normal">Impuesto</th><th className="font-normal">Estado</th></tr></thead>
            <tbody>{payments.map((p) => {
              const [l, c] = PAY[p.status] ?? [p.status, ""];
              return (<tr key={p.id} className="border-t border-line align-top">
                <td className="py-2 whitespace-nowrap">{dateLong(p.paidAt ?? p.createdAt)}</td>
                <td>{KIND[p.kind] ?? p.kind} · {p.planId} {p.isSimulated && <span className="rounded border border-violet-500/50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-violet-300">Simulado</span>}</td>
                <td className="tabular-nums">{money(p.amountMinor, p.currency)}</td><td className="tabular-nums">{p.taxMinor ? money(p.taxMinor, p.currency) : "—"}</td>
                <td className={c}>{l}{p.failureReason && <span className="block text-xs text-muted">{p.failureReason}</span>}</td></tr>);
            })}</tbody></table></div>
        )}
      </section>
    </div>
  );
}
