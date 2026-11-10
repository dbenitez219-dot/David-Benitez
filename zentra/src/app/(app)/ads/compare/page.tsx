import Link from "next/link";
import { OBJECTIVE_LABEL, statusLabel } from "@/lib/classification";
import { parseFilters } from "@/lib/filters";
import { dateLong, money, num, pct, ratio } from "@/lib/format";
import { requireOrg } from "@/server/tenancy/context";
import { loadAds } from "@/server/analytics/report";
import { ClassBadge, TrendMark } from "@/components/ui/bits";

export const metadata = { title: "Comparar anuncios — ZENTRA" };

export default async function Compare({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrg();
  const sp = await searchParams;
  const f = parseFilters(sp);
  const cur = ctx.organization.currency;
  const raw = sp.ids ? (Array.isArray(sp.ids) ? sp.ids : [sp.ids]) : [];
  const ids = raw.filter((i) => /^[a-z0-9]{10,40}$/.test(i)).slice(0, 4);
  const ads = (await loadAds(ctx.organizationId, { ...f, ad: undefined, campaign: undefined, adset: undefined, account: undefined })).filter((a) => ids.includes(a.id));
  const cprs = ads.map((a) => a.derived.costPerResult).filter((x): x is number => x !== null);
  const sameObjective = new Set(ads.map((a) => a.objective)).size === 1;
  const bestCpr = cprs.length && sameObjective ? Math.min(...cprs) : null;

  type Row = [string, (a: (typeof ads)[number]) => React.ReactNode];
  const rows: Row[] = [
    ["Campaña", (a) => a.campaignName], ["Objetivo", (a) => OBJECTIVE_LABEL[a.objective]], ["Clasificación", (a) => <ClassBadge c={a.classification} />],
    ["Estado", (a) => statusLabel(a.status)], ["Inicio", (a) => (a.startTime ? dateLong(a.startTime) : "—")],
    ["Gasto", (a) => money(a.totals.spend, cur)], ["Resultados", (a) => num(a.totals.results)],
    ["Costo por resultado", (a) => <span className={a.derived.costPerResult === bestCpr && ads.length > 1 ? "font-bold text-emerald-300" : ""}>{a.derived.costPerResult !== null ? money(a.derived.costPerResult, cur) : "—"}</span>],
    ["CTR", (a) => (a.derived.ctr !== null ? pct(a.derived.ctr) : "—")], ["CPC", (a) => (a.derived.cpc !== null ? money(a.derived.cpc, cur) : "—")],
    ["CPM", (a) => (a.derived.cpm !== null ? money(a.derived.cpm, cur) : "—")], ["ROAS", (a) => (a.derived.roas !== null ? ratio(a.derived.roas) : "—")],
    ["Frecuencia (aprox.)", (a) => (a.derived.frequency !== null ? a.derived.frequency.toFixed(2) : "—")], ["Tendencia", (a) => <TrendMark t={a.trend} />],
  ];

  return (
    <div className="animate-rise space-y-5">
      <h1 className="text-2xl font-bold">Comparar anuncios</h1>
      <p className="text-sm text-muted">Período: {dateLong(f.from)} – {dateLong(f.to)}. El mejor costo por resultado solo se resalta cuando todos los anuncios tienen el mismo objetivo; un mensaje, un lead y una venta no son comparables.</p>
      {ads.length < 2 ? (
        <div className="card p-6 text-sm text-muted">Selecciona al menos 2 anuncios en la biblioteca para compararlos.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr className="border-b border-line text-left"><th className="p-3 text-xs font-normal text-muted"> </th>{ads.map((a) => <th key={a.id} className="p-3 font-semibold">{a.name}</th>)}</tr></thead>
            <tbody>{rows.map(([label, fn]) => (
              <tr key={label} className="border-b border-line/60 last:border-0"><th scope="row" className="p-3 text-left text-xs font-normal text-muted">{label}</th>{ads.map((a) => <td key={a.id} className="p-3 tabular-nums">{fn(a)}</td>)}</tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <Link href="/ads" className="text-sm text-muted underline">← Volver a la biblioteca</Link>
    </div>
  );
}
