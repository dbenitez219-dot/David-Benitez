import Link from "next/link";
import { db } from "@/lib/db";
import { getRegional } from "@/lib/locale";
import { getAccess } from "@/server/billing/access";
import { PLAN_CATALOG, PLAN_IDS, priceFor } from "@/server/billing/plans";
import { providerFor } from "@/server/billing/providers";
import { hasRole, requireOrg } from "@/server/tenancy/context";
import { cancelAction, resumeAction, startTrialAction } from "./actions";

export const metadata = { title: "ZENTRA" };
const STATE_COLOR: Record<string, string> = { trial: "text-sky-300", active: "text-emerald-300", past_due: "text-amber-300", expired: "text-red-300", none: "text-muted" };
const PAY_COLOR: Record<string, string> = { SUCCEEDED: "text-emerald-300", PENDING: "text-amber-300", FAILED: "text-red-300", REFUNDED: "text-muted" };

export default async function Billing({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const ctx = await requireOrg();
  const { t, fmt } = await getRegional();
  const { money, dateLong, dateLocal } = fmt;
  const { msg } = await searchParams;
  const admin = hasRole(ctx.role, "ADMIN");
  const [access, payments, sub] = await Promise.all([
    getAccess(ctx.organizationId),
    db.payment.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.subscription.findFirst({ where: { organizationId: ctx.organizationId }, orderBy: { createdAt: "desc" } }),
  ]);
  const prices = await Promise.all(PLAN_IDS.map((id) => priceFor(id, ctx.organization.countryCode)));
  const stateLabel = t(`bill.state.${access.state}`), stateColor = STATE_COLOR[access.state];
  const provider = prices[0] ? providerFor(ctx.organization.countryCode, prices[0].currency) : null;
  const canceling = access.cancelAtPeriodEnd;

  return (
    <div className="animate-rise max-w-5xl space-y-6">
      <div><h1 className="text-2xl font-bold">{t("bill.title")}</h1>
        <p className="text-sm text-muted">{t("bill.sub")}</p></div>
      {msg && <p role="status" className="rounded-xl border border-line bg-panel px-4 py-2 text-sm">{msg}</p>}
      {provider?.simulated && <p role="alert" className="rounded-xl border border-violet-500/50 bg-violet-500/10 px-4 py-2 text-sm font-semibold">{t("bill.simBanner")}</p>}

      <section className="card p-5">
        <p className={`text-lg font-semibold ${stateColor}`}>{stateLabel}{access.planId ? ` · ${t("bill.planName", { name: PLAN_CATALOG[access.planId].name })}` : ""}</p>
        <ul className="mt-2 space-y-1 text-sm text-muted">
          {access.state === "trial" && <li>{t("bill.trialLeft", { days: access.daysLeft ?? 0, date: dateLong(access.trialEndsAt!) })}</li>}
          {(access.state === "active" || access.state === "past_due") && access.periodEnd && <li>{canceling ? t("bill.accessUntil", { date: dateLong(access.periodEnd) }) : t("bill.nextRenewal", { date: dateLong(access.periodEnd) })}{!canceling && sub && (sub.autoRenew ? t("bill.autoOn") : t("bill.autoOff"))}</li>}
          {access.state === "past_due" && sub?.nextRetryAt && <li>{t("bill.retry", { date: dateLong(sub.nextRetryAt) })}</li>}
          {(access.state === "expired" || access.state === "none") && <li>{t("bill.inactive")}</li>}
          {canceling && <li>{t("bill.canceling")}</li>}
        </ul>
        {admin && (access.state === "trial" || access.state === "active" || access.state === "past_due") && (
          <div className="mt-3">{canceling
            ? <form action={resumeAction}><button className="btn btn-ghost !py-1.5 text-sm">{t("bill.resume")}</button></form>
            : <form action={cancelAction}><button className="btn btn-ghost !py-1.5 text-sm">{t("bill.cancel")}</button></form>}</div>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {PLAN_IDS.map((id, i) => {
          const p = PLAN_CATALOG[id], price = prices[i], current = access.planId === id && (access.state === "active" || access.state === "trial" || access.state === "past_due");
          return (
            <article key={id} className={`card flex flex-col p-5 ${current ? "border-zred" : ""}`}>
              <h2 className="text-lg font-bold">{p.name} {current && <span className="ml-1 rounded-full border border-zred/50 px-2 py-0.5 text-xs font-normal text-red-300">{t("bill.yourPlan")}</span>}</h2>
              <p className="text-sm text-muted">{t(`plan.${id}.desc`)}</p>
              <p className="mt-3 text-2xl font-bold">{price ? money(price.amountMinor, price.currency) : "—"}<span className="text-sm font-normal text-muted">{price ? t("bill.perMonth") : ""}</span></p>
              {price ? <p className="text-xs text-muted">{price.taxIncluded ? t("bill.taxIncl") : t("bill.taxExcl")}{price.taxPercent ? ` (${Number(price.taxPercent)}%)` : ""}</p>
                : <p className="text-xs text-amber-300">{t("bill.noPrice")}</p>}
              <ul className="mt-3 flex-1 space-y-1 text-sm">{p.highlights.map((_, n) => <li key={n}>✓ {t(`plan.${id}.h${n + 1}`)}</li>)}</ul>
              {admin && (
                <div className="mt-4 space-y-2">
                  {access.state === "none" && !access.trialUsed && <form action={startTrialAction}><input type="hidden" name="plan" value={id} /><button className="btn btn-ghost w-full">{t("bill.btn.trial")}</button></form>}
                  {price && <Link href={`/billing/checkout?plan=${id}`} className="btn w-full">{current && access.state === "active" ? t("bill.btn.renew") : current ? t("bill.btn.activate") : t("bill.btn.choose")}</Link>}
                </div>
              )}
            </article>
          );
        })}
      </section>

      <section className="card p-5">
        <h2 className="mb-3 font-semibold">{t("bill.history")}</h2>
        {payments.length === 0 ? <p className="text-sm text-muted">{t("bill.history.empty")}</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-xs text-muted"><tr><th className="py-2 font-normal">{t("bill.th.date")}</th><th className="font-normal">{t("bill.th.item")}</th><th className="font-normal">{t("bill.th.amount")}</th><th className="font-normal">{t("bill.th.tax")}</th><th className="font-normal">{t("bill.th.status")}</th></tr></thead>
            <tbody>{payments.map((p) => {
              const l = t(`bill.pay.${p.status}`), c = PAY_COLOR[p.status] ?? "";
              return (<tr key={p.id} className="border-t border-line align-top">
                <td className="py-2 whitespace-nowrap">{dateLocal(p.paidAt ?? p.createdAt)}</td>
                <td>{t(`bill.kind.${p.kind}`)} · {p.planId} {p.isSimulated && <span className="rounded border border-violet-500/50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-violet-300">{t("bill.simulated")}</span>}</td>
                <td className="tabular-nums">{money(p.amountMinor, p.currency)}</td><td className="tabular-nums">{p.taxMinor ? money(p.taxMinor, p.currency) : "—"}</td>
                <td className={c}>{l}{p.failureReason && <span className="block text-xs text-muted">{p.failureReason}</span>}</td></tr>);
            })}</tbody></table></div>
        )}
      </section>
    </div>
  );
}
