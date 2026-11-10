import type { AdClassification } from "@prisma/client";
import { db } from "@/lib/db";
import type { Filters } from "@/lib/filters";
import { benchmarks, classify, type ClassifyInput } from "./classify";
import { addRow, delta, derive, emptyTotals, trendOf, type Derived, type Objective, type Totals, type Trend } from "./metrics";

export type AdRow = {
  id: string; name: string; status: string; startTime: Date | null; creativeUrl: string | null;
  campaignId: string; campaignName: string; adSetName: string; objective: Objective; isDemo: boolean;
  totals: Totals; derived: Derived; activeDays: number;
  classification: AdClassification; trend: Trend; series: { date: string; spend: number; results: number }[];
};

export type DayPoint = { date: string; spend: number; results: number; revenue: number };

const adWhere = (organizationId: string, f: Filters) => ({
  organizationId,
  ...(f.ad ? { id: f.ad } : {}),
  adSet: { ...(f.adset ? { id: f.adset } : {}), ...(f.campaign ? { campaignId: f.campaign } : {}), ...(f.account ? { campaign: { adAccountId: f.account } } : {}) },
});

const iso = (d: Date) => d.toISOString().slice(0, 10);

async function loadRows(organizationId: string, f: Filters, from: Date, to: Date) {
  return db.adInsightDaily.findMany({
    where: { organizationId, date: { gte: from, lte: to }, ad: adWhere(organizationId, f) },
    select: {
      adId: true, date: true, spend: true, impressions: true, reach: true, clicks: true, messages: true, leads: true, conversions: true, revenue: true,
      ad: { select: { adSet: { select: { campaign: { select: { objective: true } } } } } },
    },
    orderBy: { date: "asc" },
  });
}

const toRow = (r: Awaited<ReturnType<typeof loadRows>>[number]) => ({
  spend: Number(r.spend), impressions: r.impressions, reach: r.reach, clicks: r.clicks,
  messages: r.messages, leads: r.leads, conversions: r.conversions, revenue: r.revenue === null ? null : Number(r.revenue),
});
const objOf = (r: Awaited<ReturnType<typeof loadRows>>[number]) => (r.ad.adSet.campaign.objective ?? "MESSAGES") as Objective;

/** Resumen del período actual, el anterior y la serie diaria. */
export async function loadSummary(organizationId: string, f: Filters) {
  const [cur, prev] = await Promise.all([loadRows(organizationId, f, f.from, f.to), loadRows(organizationId, f, f.prevFrom, f.prevTo)]);
  const sum = (rows: typeof cur) => rows.reduce((t, r) => addRow(t, toRow(r), objOf(r)), emptyTotals());
  const current = sum(cur), previous = sum(prev);
  const byDay = new Map<string, DayPoint>();
  for (let t = f.from.getTime(); t <= f.to.getTime(); t += 86_400_000) byDay.set(iso(new Date(t)), { date: iso(new Date(t)), spend: 0, results: 0, revenue: 0 });
  for (const r of cur) {
    const p = byDay.get(iso(r.date))!;
    const t = addRow(emptyTotals(), toRow(r), objOf(r));
    p.spend += t.spend; p.results += t.results; p.revenue += t.revenue;
  }
  const d = { current: derive(current), previous: derive(previous) };
  return {
    current, previous, derived: d,
    deltas: {
      spend: delta(current.spend, previous.spend), results: delta(current.results, previous.results),
      revenue: delta(current.revenue, previous.revenue), roas: delta(d.current.roas, d.previous.roas),
      costPerResult: delta(d.current.costPerResult, d.previous.costPerResult),
    },
    series: [...byDay.values()],
    hasData: cur.length > 0,
  };
}

/** Anuncios con métricas, clasificación y tendencia para el período. */
export async function loadAds(organizationId: string, f: Filters): Promise<AdRow[]> {
  const [ads, rows] = await Promise.all([
    db.ad.findMany({
      where: adWhere(organizationId, f),
      select: {
        id: true, name: true, status: true, startTime: true, creativeUrl: true,
        adSet: { select: { name: true, campaign: { select: { id: true, name: true, objective: true, adAccount: { select: { isDemo: true } } } } } },
      },
    }),
    loadRows(organizationId, f, f.from, f.to),
  ]);
  const byAd = new Map<string, typeof rows>();
  for (const r of rows) byAd.set(r.adId, [...(byAd.get(r.adId) ?? []), r]);

  const partial = ads.map((a) => {
    const objective = (a.adSet.campaign.objective ?? "MESSAGES") as Objective;
    const rs = byAd.get(a.id) ?? [];
    const totals = rs.reduce((t, r) => addRow(t, toRow(r), objective), emptyTotals());
    const series = rs.map((r) => ({ date: iso(r.date), spend: Number(r.spend), results: objOf(r) === "MESSAGES" ? r.messages : objOf(r) === "LEADS" ? r.leads : r.conversions }));
    return { a, objective, totals, series, activeDays: rs.filter((r) => Number(r.spend) > 0).length };
  });
  const bench = benchmarks(partial.map<ClassifyInput>((p) => ({ objective: p.objective, totals: p.totals, activeDays: p.activeDays })));
  return partial.map((p) => ({
    id: p.a.id, name: p.a.name, status: p.a.status, startTime: p.a.startTime, creativeUrl: p.a.creativeUrl,
    campaignId: p.a.adSet.campaign.id, campaignName: p.a.adSet.campaign.name, adSetName: p.a.adSet.name,
    objective: p.objective, isDemo: p.a.adSet.campaign.adAccount.isDemo,
    totals: p.totals, derived: derive(p.totals), activeDays: p.activeDays,
    classification: classify({ objective: p.objective, totals: p.totals, activeDays: p.activeDays }, bench),
    trend: trendOf(p.series), series: p.series,
  }));
}

/** Opciones para los filtros (cuentas, campañas, conjuntos, anuncios) de la organización. */
export async function loadFilterOptions(organizationId: string) {
  const [accounts, campaigns, adsets, ads] = await Promise.all([
    db.adAccount.findMany({ where: { organizationId }, select: { id: true, name: true, isDemo: true }, orderBy: { name: "asc" } }),
    db.campaign.findMany({ where: { organizationId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.adSet.findMany({ where: { organizationId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.ad.findMany({ where: { organizationId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return { accounts, campaigns, adsets, ads };
}
