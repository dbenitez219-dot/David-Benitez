import Link from "next/link";
import { AdClassification } from "@prisma/client";
import { parseFilters } from "@/lib/filters";
import { getRegional } from "@/lib/locale";
import { requireOrg } from "@/server/tenancy/context";
import { loadAds, loadFilterOptions, type AdRow } from "@/server/analytics/report";
import { FilterBar } from "@/components/FilterBar";
import { ClassBadge, DemoTag, Sparkline, TrendMark } from "@/components/ui/bits";

export const metadata = { title: "ZENTRA" };
type SP = Promise<Record<string, string | string[] | undefined>>;

const SORTS: Record<string, [string, (a: AdRow) => number | null, "asc" | "desc"]> = {
  spend: ["sort.spend", (a) => a.totals.spend, "desc"],
  results: ["sort.results", (a) => a.totals.results, "desc"],
  cpr: ["sort.cpr", (a) => a.derived.costPerResult, "asc"],
  ctr: ["sort.ctr", (a) => a.derived.ctr, "desc"],
  roas: ["sort.roas", (a) => a.derived.roas, "desc"],
  start: ["sort.start", (a) => a.startTime?.getTime() ?? null, "desc"],
};
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function AdsPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireOrg();
  const { t, fmt } = await getRegional();
  const { money, num, pct, ratio, dateLong } = fmt;
  const sp = await searchParams;
  const f = parseFilters(sp);
  const cur = ctx.organization.currency;
  const q = one(sp.q).trim().slice(0, 60).toLowerCase();
  const cls = Object.values(AdClassification).includes(one(sp.cls) as AdClassification) ? (one(sp.cls) as AdClassification) : "";
  const status = ["ACTIVE", "PAUSED"].includes(one(sp.status)) ? one(sp.status) : "";
  const sortKey = one(sp.sort) in SORTS ? one(sp.sort) : "spend";

  const [options, all] = await Promise.all([loadFilterOptions(ctx.organizationId), loadAds(ctx.organizationId, f)]);
  const [, getter, dir] = SORTS[sortKey];
  const ads = all
    .filter((a) => (!q || `${a.name} ${a.campaignName} ${a.adSetName}`.toLowerCase().includes(q)) && (!cls || a.classification === cls) && (!status || a.status === status))
    .sort((a, b) => {
      const x = getter(a), y = getter(b);
      if (x === null && y === null) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return dir === "asc" ? x - y : y - x;
    });
  const statusText = (s: string) => (s === "ACTIVE" || s === "PAUSED" ? t(`status.${s}`) : t("status.OTHER"));

  const extra = (
    <>
      <label className="col-span-2 block text-xs text-muted md:col-span-1">{t("ads.search")}<input name="q" defaultValue={q} placeholder={t("ads.searchPh")} className="input !py-2 !text-sm" /></label>
      <label className="block text-xs text-muted">{t("ads.class")}
        <select name="cls" defaultValue={cls} className="input !py-2 !text-sm"><option value="">{t("ads.opt.all")}</option>
          {Object.values(AdClassification).map((k) => <option key={k} value={k}>{t(`class.${k}`)}</option>)}</select></label>
      <label className="block text-xs text-muted">{t("ads.status")}
        <select name="status" defaultValue={status} className="input !py-2 !text-sm"><option value="">{t("filter.all")}</option><option value="ACTIVE">{t("ads.opt.active")}</option><option value="PAUSED">{t("ads.opt.paused")}</option></select></label>
      <label className="block text-xs text-muted">{t("ads.sort")}
        <select name="sort" defaultValue={sortKey} className="input !py-2 !text-sm">{Object.entries(SORTS).map(([k, [l]]) => <option key={k} value={k}>{t(l)}</option>)}</select></label>
    </>
  );

  return (
    <div className="animate-rise space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("ads.title")}</h1>
        <p className="text-sm text-muted">{t("ads.count", { n: ads.length, total: all.length })}</p>
      </div>
      <FilterBar action="/ads" f={f} options={options} extra={extra} />

      {all.length === 0 ? (
        <div className="card p-6 text-sm text-muted">{t("ads.empty")}</div>
      ) : ads.length === 0 ? (
        <div className="card p-6 text-sm text-muted">{t("ads.noMatch")}</div>
      ) : (
        <form action="/ads/compare" method="get">
          <input type="hidden" name="from" value={f.from.toISOString().slice(0, 10)} />
          <input type="hidden" name="to" value={f.to.toISOString().slice(0, 10)} />
          <div className="sticky top-0 z-10 mb-3 flex items-center justify-between rounded-xl border border-line bg-ink/90 px-4 py-2 backdrop-blur">
            <span className="text-xs text-muted">{t("ads.period", { from: dateLong(f.from), to: dateLong(f.to) })}</span>
            <button className="btn !py-1.5 text-sm">{t("ads.compareBtn")}</button>
          </div>
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {ads.map((a) => (
              <article key={a.id} className="card flex flex-col overflow-hidden">
                <div className="flex h-28 items-center justify-center bg-gradient-to-br from-zred/25 via-panel to-ink text-xs uppercase tracking-widest text-muted">
                  {a.creativeUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={a.creativeUrl} alt={a.name} className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : t("ads.noImage")}
                </div>
                <div className="flex flex-1 flex-col gap-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="truncate font-semibold">{a.name} {a.isDemo && <DemoTag />}</h2>
                      <p className="truncate text-xs text-muted">{a.campaignName} · {a.adSetName}</p>
                    </div>
                    <label className="flex items-center gap-1 text-xs text-muted"><input type="checkbox" name="ids" value={a.id} className="accent-[#e5202e]" />{t("ads.compare")}</label>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <ClassBadge c={a.classification} />
                    <span className={`text-xs ${a.status === "ACTIVE" ? "text-emerald-400" : "text-muted"}`}>{a.status === "ACTIVE" ? "● " : a.status === "PAUSED" ? "❚❚ " : "⚠ "}{statusText(a.status)}</span>
                    <span className="text-xs text-muted">{t(`obj.${a.objective}`)}</span>
                  </div>
                  <dl className="grid grid-cols-3 gap-x-3 gap-y-2 text-sm">
                    {([
                      [t("metric.spend"), money(a.totals.spend, cur)], [t("metric.results"), num(a.totals.results)], [t("metric.cpr"), a.derived.costPerResult !== null ? money(a.derived.costPerResult, cur) : "—"],
                      [t("metric.ctr"), a.derived.ctr !== null ? pct(a.derived.ctr) : "—"], [t("metric.cpc"), a.derived.cpc !== null ? money(a.derived.cpc, cur) : "—"], [t("metric.cpm"), a.derived.cpm !== null ? money(a.derived.cpm, cur) : "—"],
                      ...(a.derived.roas !== null ? [[t("metric.roas"), ratio(a.derived.roas)]] : []),
                    ] as [string, string][]).map(([k, v]) => <div key={k}><dt className="text-[11px] text-muted">{k}</dt><dd className="font-medium tabular-nums">{v}</dd></div>)}
                  </dl>
                  <div className="mt-auto flex items-center justify-between border-t border-line pt-3 text-xs text-muted">
                    <span>{t("ads.start", { date: a.startTime ? dateLong(a.startTime) : "—" })}</span>
                    <span className="flex items-center gap-2"><TrendMark t={a.trend} /><Sparkline values={a.series.map((s) => s.results)} width={70} height={24} /></span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </form>
      )}
      <Link href="/dashboard" className="text-sm text-muted underline">{t("common.back")}</Link>
    </div>
  );
}
