import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter } from "@/lib/locale";
import { PLAN_CATALOG, PLAN_IDS, priceFor, taxBreakdown, type PlanId } from "@/server/billing/plans";
import { providerFor } from "@/server/billing/providers";
import { requireOrg } from "@/server/tenancy/context";
import { checkoutAction } from "../actions";

export const metadata = { title: "Activar plan — ZENTRA" };

export default async function Checkout({ searchParams }: { searchParams: Promise<{ plan?: string; error?: string }> }) {
  const ctx = await requireOrg("ADMIN");
  const { money } = await getFormatter();
  const { plan, error } = await searchParams;
  if (!plan || !PLAN_IDS.includes(plan as PlanId)) notFound();
  const id = plan as PlanId, p = PLAN_CATALOG[id];
  const price = await priceFor(id, ctx.organization.countryCode);
  const provider = price ? providerFor(ctx.organization.countryCode, price.currency) : null;
  const tax = price ? taxBreakdown(price.amountMinor, price.taxIncluded, price.taxPercent === null ? null : Number(price.taxPercent)) : null;

  return (
    <div className="animate-rise max-w-xl space-y-5">
      <h1 className="text-2xl font-bold">Activar plan {p.name}</h1>
      {error && <p role="alert" className="rounded-xl border border-zred/40 bg-zred/10 px-4 py-2 text-sm text-red-200">{error}</p>}
      {!price || !tax ? <p className="card p-5 text-sm text-muted">Este plan todavía no tiene precio definido para tu país.</p>
        : !provider ? <p className="card p-5 text-sm text-muted">Los pagos todavía no están habilitados para tu país y moneda. Te avisaremos cuando estén disponibles.</p> : (
        <form action={checkoutAction} className="card space-y-4 p-5">
          <input type="hidden" name="plan" value={id} />
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Plan {p.name} (1 mes)</dt><dd className="tabular-nums">{money(tax.net, price.currency)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Impuestos{price.taxPercent ? ` (${Number(price.taxPercent)}%)` : ""}</dt><dd className="tabular-nums">{tax.tax ? money(tax.tax, price.currency) : "—"}</dd></div>
            <div className="flex justify-between border-t border-line pt-2 text-base font-semibold"><dt>Total</dt><dd className="tabular-nums">{money(tax.total, price.currency)}</dd></div>
          </dl>
          {provider.simulated && <p className="rounded-lg border border-violet-500/50 bg-violet-500/10 p-3 text-sm"><strong>Pago SIMULADO.</strong> No hay un proveedor de pago real conectado: esto es una prueba y no se cobra nada.</p>}
          <p className="text-xs text-muted">Medio de pago: {provider.name}. ZENTRA no guarda datos de tu tarjeta.</p>
          <label className="flex items-start gap-2 rounded-lg border border-line p-3 text-sm">
            <input type="checkbox" name="consent" className="mt-1 accent-[#e5202e]" disabled={!provider.supportsRecurring} />
            <span>Autorizo a ZENTRA a cobrar automáticamente cada mes <strong>{money(tax.total, price.currency)}</strong> a este medio de pago, hasta que yo cancele. <span className="block text-xs text-muted">Opcional. Si no lo marcas, no habrá cobros automáticos: renovarás tú cuando quieras.</span></span>
          </label>
          <button className="btn w-full">Continuar al pago</button>
        </form>
      )}
      <Link href="/billing" className="text-sm text-muted underline">← Volver a Plan y pagos</Link>
    </div>
  );
}
