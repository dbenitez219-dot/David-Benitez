import Link from "next/link";
import { db } from "@/lib/db";
import { parseFilters } from "@/lib/filters";
import { getFormatter } from "@/lib/locale";
import { getAccess } from "@/server/billing/access";
import { PLAN_CATALOG } from "@/server/billing/plans";
import { commercialSummary } from "@/server/commercial/service";
import { hasRole, requireOrg } from "@/server/tenancy/context";
import { ActionForm } from "@/components/ActionForm";
import { KpiCard } from "@/components/ui/bits";
import { addLeadAction, addSaleAction, convertLeadAction, deleteLeadAction, deleteSaleAction, leadStatusAction } from "./actions";

export const metadata = { title: "Ventas — ZENTRA" };
const LEAD: Record<string, string> = { NEW: "Nuevo", CONTACTED: "Contactado", WON: "Ganado", LOST: "Perdido" };

export default async function Sales({ searchParams }: { searchParams: Promise<{ range?: string; msg?: string }> }) {
  const ctx = await requireOrg();
  const { dateLong, money, num, pct, ratio } = await getFormatter();
  const sp = await searchParams;
  const access = await getAccess(ctx.organizationId);
  const included = access.planId ? PLAN_CATALOG[access.planId].entitlements.commercial : false;
  if (!included) return (
    <div className="animate-rise max-w-xl space-y-4">
      <h1 className="text-2xl font-bold">Ventas y rentabilidad</h1>
      <div className="card p-6 text-sm"><p className="font-semibold">El análisis comercial es parte de los planes Business y Agency.</p>
        <p className="mt-2 text-muted">Registra clientes, leads y ventas reales y mide tu costo por cliente y tu ganancia verdadera. <Link href="/billing" className="text-zred underline">Ver planes</Link></p></div>
    </div>
  );
  const f = parseFilters({ range: sp.range ?? "30" });
  const cur = ctx.organization.currency, org = ctx.organizationId;
  const writable = hasRole(ctx.role, "ANALYST") && access.premium && access.entitlements.commercial;
  const [s, leads, sales, campaigns, customers] = await Promise.all([
    commercialSummary(org, f.from, f.to),
    db.lead.findMany({ where: { organizationId: org }, orderBy: { createdAt: "desc" }, take: 15 }),
    db.sale.findMany({ where: { organizationId: org }, orderBy: { soldAt: "desc" }, take: 15, include: { customer: { select: { name: true } } } }),
    db.campaign.findMany({ where: { organizationId: org }, select: { externalId: true, name: true }, orderBy: { name: "asc" } }),
    db.customer.findMany({ where: { organizationId: org }, select: { id: true, name: true }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  const cname = new Map(campaigns.map((c) => [c.externalId, c.name]));
  const CampSelect = ({ name = "campaignExternalId" }: { name?: string }) => (
    <label className="block text-sm"><span className="mb-1 block">Campaña de origen</span><select className="input" name={name}><option value="">Sin campaña</option>{campaigns.map((c) => <option key={c.externalId} value={c.externalId}>{c.name}</option>)}</select></label>
  );

  return (
    <div className="animate-rise max-w-5xl space-y-6">
      <div><h1 className="text-2xl font-bold">Ventas y rentabilidad</h1>
        <p className="text-sm text-muted">Aquí cuentan <strong>solo las ventas que tú registras</strong>. Un mensaje o un lead no es una venta: se mide cuánto te cuesta realmente cada cliente y cuánto ganas.</p></div>
      {sp.msg && <p role="status" className="rounded-xl border border-line bg-panel px-4 py-2 text-sm">{sp.msg}</p>}
      {!access.premium && <p className="rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-2 text-sm">Tu suscripción no está activa: puedes ver tus datos, pero no registrar nuevos.</p>}
      <div className="flex gap-2 text-sm">{["7", "30", "60", "90"].map((r) => <Link key={r} href={`/sales?range=${r}`} className={`rounded-full border px-3 py-1 ${f.rangeKey === r ? "border-zred bg-zred/15" : "border-line text-muted hover:text-white"}`}>{r} días</Link>)}</div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Inversión publicitaria (Meta)" value={money(s.spend, cur)} />
        <KpiCard label="Ingresos registrados" value={s.sales ? money(s.revenue, cur) : "—"} note={s.sales ? `${num(s.sales)} venta(s)` : "Sin ventas registradas"} />
        <KpiCard label="Ganancia tras publicidad" value={s.sales ? money(s.netProfit, cur) : "—"} note={s.marginPct !== null ? `Margen ${pct(s.marginPct, 1)}` : undefined} />
        <KpiCard label="ROAS real" value={s.roas !== null ? ratio(s.roas) : "—"} note="Ingresos reales ÷ inversión" />
        <KpiCard label="Clientes nuevos" value={num(s.customers)} />
        <KpiCard label="Costo real por cliente" value={s.costPerCustomer !== null ? money(s.costPerCustomer, cur) : "—"} note={s.customers ? undefined : "Sin clientes registrados"} />
        <KpiCard label="Leads" value={num(s.leads)} />
        <KpiCard label="Costos de las ventas" value={s.sales ? money(s.saleCost, cur) : "—"} />
      </div>
      {s.excludedSales > 0 && <p className="text-xs text-amber-300">{s.excludedSales} venta(s) en otra moneda no se incluyen en estos totales.</p>}
      {s.currencyWarning && <p className="text-xs text-amber-300">Alguna cuenta publicitaria usa una moneda distinta a la de tu organización: revisa que la inversión sea comparable.</p>}

      <section className="card p-5">
        <h2 className="mb-3 font-semibold">Por campaña</h2>
        <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-xs text-muted"><tr><th className="py-2 font-normal">Campaña</th><th className="font-normal">Inversión</th><th className="font-normal">Leads</th><th className="font-normal">Clientes</th><th className="font-normal">Costo/cliente</th><th className="font-normal">Ingresos</th><th className="font-normal">ROAS</th><th className="font-normal">Ganancia</th></tr></thead>
          <tbody>{s.campaigns.map((c) => (
            <tr key={c.externalId ?? "none"} className="border-t border-line"><td className="py-2">{c.name}</td><td className="tabular-nums">{money(c.spend, cur)}</td><td>{c.leads}</td><td>{c.customers}</td>
              <td className="tabular-nums">{c.costPerCustomer !== null ? money(c.costPerCustomer, cur) : "—"}</td><td className="tabular-nums">{c.sales ? money(c.revenue, cur) : "—"}</td>
              <td>{c.roas !== null ? ratio(c.roas) : "—"}</td><td className={`tabular-nums ${c.profit < 0 ? "text-red-300" : ""}`}>{c.spend || c.sales ? money(c.profit, cur) : "—"}</td></tr>))}</tbody></table></div>
        {s.campaigns.length === 0 && <p className="text-sm text-muted">Sin datos en el período.</p>}
      </section>

      {writable && (
        <div className="grid gap-4 md:grid-cols-2">
          <section className="card p-5"><h2 className="mb-3 font-semibold">Registrar una venta</h2>
            <ActionForm action={addSaleAction} submit="Guardar venta" className="space-y-3">
              <label className="block text-sm"><span className="mb-1 block">Ingreso ({cur})</span><input className="input" name="revenue" type="number" step="any" min="0" required /></label>
              <label className="block text-sm"><span className="mb-1 block">Costo de lo vendido ({cur})</span><input className="input" name="cost" type="number" step="any" min="0" defaultValue={0} /></label>
              <label className="block text-sm"><span className="mb-1 block">Cliente existente</span><select className="input" name="customerId"><option value="">— nuevo cliente —</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              <div className="grid grid-cols-2 gap-3"><label className="block text-sm"><span className="mb-1 block">Nombre (si es nuevo)</span><input className="input" name="customerName" maxLength={120} /></label>
                <label className="block text-sm"><span className="mb-1 block">Teléfono</span><input className="input" name="customerPhone" maxLength={40} /></label></div>
              <CampSelect />
              <label className="block text-sm"><span className="mb-1 block">Fecha</span><input className="input" name="soldAt" type="date" /></label>
            </ActionForm></section>
          <section className="card p-5"><h2 className="mb-3 font-semibold">Registrar un lead</h2>
            <ActionForm action={addLeadAction} submit="Guardar lead" className="space-y-3">
              <label className="block text-sm"><span className="mb-1 block">Nombre</span><input className="input" name="name" required maxLength={120} /></label>
              <div className="grid grid-cols-2 gap-3"><label className="block text-sm"><span className="mb-1 block">Teléfono</span><input className="input" name="phone" maxLength={40} /></label>
                <label className="block text-sm"><span className="mb-1 block">Correo</span><input className="input" name="email" type="email" maxLength={120} /></label></div>
              <label className="block text-sm"><span className="mb-1 block">Origen (WhatsApp, formulario…)</span><input className="input" name="source" maxLength={80} /></label>
              <CampSelect />
            </ActionForm></section>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5"><h2 className="mb-3 font-semibold">Últimas ventas</h2>
          {sales.length === 0 ? <p className="text-sm text-muted">Aún no registraste ventas.</p> : <ul className="divide-y divide-line text-sm">{sales.map((x) => (
            <li key={x.id} className="flex items-start justify-between gap-2 py-2"><div><p className="font-medium tabular-nums">{money(Number(x.revenue), x.currency)} <span className="text-xs font-normal text-muted">(costo {money(Number(x.cost), x.currency)})</span></p>
              <p className="text-xs text-muted">{dateLong(x.soldAt)} · {x.customer?.name ?? "Sin cliente"} · {x.campaignExternalId ? (cname.get(x.campaignExternalId) ?? "campaña") : "sin campaña"}</p></div>
              {writable && <form action={deleteSaleAction}><input type="hidden" name="id" value={x.id} /><button className="text-xs text-muted underline hover:text-white">Borrar</button></form>}</li>))}</ul>}</section>
        <section className="card p-5"><h2 className="mb-3 font-semibold">Leads</h2>
          {leads.length === 0 ? <p className="text-sm text-muted">Aún no registraste leads.</p> : <ul className="divide-y divide-line text-sm">{leads.map((l) => (
            <li key={l.id} className="py-2"><p className="font-medium">{l.name} <span className="text-xs font-normal text-muted">· {LEAD[l.status] ?? l.status}</span></p>
              <p className="text-xs text-muted">{[l.phone, l.source, l.campaignExternalId ? cname.get(l.campaignExternalId) : null].filter(Boolean).join(" · ") || "—"}</p>
              {writable && l.status !== "WON" && <div className="mt-1 flex flex-wrap gap-2 text-xs">
                <form action={convertLeadAction}><input type="hidden" name="id" value={l.id} /><button className="underline hover:text-white">Convertir en cliente</button></form>
                {l.status === "NEW" && <form action={leadStatusAction}><input type="hidden" name="id" value={l.id} /><input type="hidden" name="status" value="CONTACTED" /><button className="underline hover:text-white">Marcar contactado</button></form>}
                <form action={leadStatusAction}><input type="hidden" name="id" value={l.id} /><input type="hidden" name="status" value="LOST" /><button className="underline hover:text-white">Perdido</button></form>
                <form action={deleteLeadAction}><input type="hidden" name="id" value={l.id} /><button className="underline hover:text-white">Borrar</button></form></div>}</li>))}</ul>}</section>
      </div>
    </div>
  );
}
