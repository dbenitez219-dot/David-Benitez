import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { registerUser } from "@/server/auth/service";
import { seedDemo, removeDemo } from "@/server/demo/demo-data";
import { loadAds, loadSummary } from "@/server/analytics/report";
import { parseFilters } from "@/lib/filters";
import { addRow, delta, derive, emptyTotals, resultsFor, trendOf } from "@/server/analytics/metrics";
import { benchmarks, classify, DEFAULT_CONFIG } from "@/server/analytics/classify";

const PW = "Correcta12345";
const mk = async (email: string) => {
  const r = await registerUser({ name: "T", email, password: PW, organizationName: "Org" });
  if (!r.ok) throw new Error("registro");
  return r.data.organizationId!;
};
beforeEach(async () => {
  await db.rateLimit.deleteMany(); await db.auditLog.deleteMany(); await db.organization.deleteMany(); await db.user.deleteMany();
});
afterAll(() => db.$disconnect());

describe("métricas", () => {
  it("deriva CTR, CPC, CPM, costo por resultado y ROAS", () => {
    const t = addRow(emptyTotals(), { spend: 100, impressions: 10_000, reach: 8000, clicks: 200, messages: 0, leads: 0, conversions: 5, revenue: 500 }, "SALES");
    const d = derive(t);
    expect(d.ctr).toBeCloseTo(2); expect(d.cpc).toBeCloseTo(0.5); expect(d.cpm).toBeCloseTo(10);
    expect(d.costPerResult).toBeCloseTo(20); expect(d.roas).toBeCloseTo(5);
  });
  it("no inventa métricas: sin datos devuelve null; ROAS null sin ingresos", () => {
    const d = derive(emptyTotals());
    expect(Object.values(d).every((v) => v === null)).toBe(true);
    const t = addRow(emptyTotals(), { spend: 10, impressions: 100, reach: 90, clicks: 2, messages: 3, leads: 0, conversions: 0, revenue: null }, "MESSAGES");
    expect(derive(t).roas).toBeNull();
  });
  it("un mensaje no es una venta", () => {
    expect(resultsFor("SALES", { messages: 50, leads: 9, conversions: 2 })).toBe(2);
    expect(resultsFor("MESSAGES", { messages: 50, leads: 9, conversions: 2 })).toBe(50);
  });
  it("variación y tendencia", () => {
    expect(delta(150, 100)).toBe(50); expect(delta(1, 0)).toBeNull(); expect(delta(null, 5)).toBeNull();
    const mk = (r: number[]) => r.map((results) => ({ spend: 10, results }));
    expect(trendOf(mk([1, 1, 3, 3]))).toBe("UP"); expect(trendOf(mk([3, 3, 1, 1]))).toBe("DOWN"); expect(trendOf(mk([2, 2]))).toBeNull();
  });
});

describe("clasificación", () => {
  const T = (spend: number, results: number) => ({ ...emptyTotals(), spend, results, impressions: 5000, clicks: 100 });
  it("no juzga con datos insuficientes", () => {
    expect(classify({ objective: "LEADS", totals: T(1000, 0), activeDays: 1 }, {})).toBe("INSUFFICIENT_DATA");
    expect(classify({ objective: "LEADS", totals: T(DEFAULT_CONFIG.minSpend, 5), activeDays: 2 }, { LEADS: 10_000 })).toBe("INSUFFICIENT_DATA");
  });
  it("clasifica según el costo por resultado relativo a la mediana", () => {
    const bench = { MESSAGES: 10_000 };
    const c = (cpr: number) => classify({ objective: "MESSAGES", totals: T(100_000, 100_000 / cpr), activeDays: 10 }, bench);
    expect(c(5_000)).toBe("WINNER"); expect(c(9_000)).toBe("GOOD"); expect(c(11_000)).toBe("WATCH");
    expect(c(15_000)).toBe("LOW"); expect(c(30_000)).toBe("LOSER");
  });
  it("gasto alto sin resultados es perdedor; gasto moderado queda en observación", () => {
    expect(classify({ objective: "LEADS", totals: T(150_000, 0), activeDays: 10 }, {})).toBe("LOSER");
    expect(classify({ objective: "LEADS", totals: T(60_000, 0), activeDays: 10 }, {})).toBe("WATCH");
  });
  it("benchmarks ignora anuncios sin datos suficientes", () => {
    const b = benchmarks([{ objective: "LEADS", totals: T(100_000, 10), activeDays: 10 }, { objective: "LEADS", totals: T(500, 5), activeDays: 1 }]);
    expect(b.LEADS).toBe(10_000);
  });
});

describe("filtros", () => {
  it("período por defecto 30 días y período anterior equivalente", () => {
    const f = parseFilters({}, new Date("2026-06-30T12:00:00Z"));
    expect(f.days).toBe(30); expect(f.to.toISOString().slice(0, 10)).toBe("2026-06-30");
    expect(f.prevTo.toISOString().slice(0, 10)).toBe("2026-05-31"); expect(f.prevFrom.toISOString().slice(0, 10)).toBe("2026-05-02");
  });
  it("rango personalizado y entradas inválidas", () => {
    expect(parseFilters({ from: "2026-06-10", to: "2026-06-01" }).days).toBe(10);
    expect(parseFilters({ range: "999", ad: "'; drop table" }).ad).toBeUndefined();
  });
});

describe("datos de demostración", () => {
  it("se generan marcados como demo, son idempotentes y se pueden eliminar", async () => {
    const org = await mk("a@x.com");
    expect((await seedDemo(org)).created).toBe(true);
    expect((await seedDemo(org)).created).toBe(false);
    const acct = await db.adAccount.findFirstOrThrow({ where: { organizationId: org } });
    expect(acct.isDemo).toBe(true);
    expect(await db.ad.count({ where: { organizationId: org } })).toBe(12);
    expect(await removeDemo(org)).toBe(1);
    expect(await db.adInsightDaily.count({ where: { organizationId: org } })).toBe(0);
  });
  it("el resumen y la clasificación producen variedad y comparan períodos", async () => {
    const org = await mk("a@x.com");
    await seedDemo(org);
    const f = parseFilters({ range: "30" });
    const s = await loadSummary(org, f);
    expect(s.current.spend).toBeGreaterThan(0); expect(s.deltas.spend).not.toBeNull(); expect(s.series).toHaveLength(30);
    const ads = await loadAds(org, f);
    const kinds = new Set(ads.map((a) => a.classification));
    expect(ads).toHaveLength(12); expect(kinds.has("WINNER")).toBe(true); expect(kinds.has("INSUFFICIENT_DATA")).toBe(true);
    expect(kinds.has("LOSER") || kinds.has("LOW")).toBe(true);
    expect(ads.every((a) => a.isDemo)).toBe(true);
    const sales = ads.find((a) => a.objective === "SALES" && a.derived.roas !== null);
    expect(sales).toBeDefined();
  });
  it("los filtros restringen y otra organización no ve nada", async () => {
    const a = await mk("a@x.com"), b = await mk("b@x.com");
    await seedDemo(a);
    const camp = await db.campaign.findFirstOrThrow({ where: { organizationId: a, objective: "LEADS" } });
    const only = await loadAds(a, parseFilters({ campaign: camp.id }));
    expect(only).toHaveLength(3);
    expect(await loadAds(b, parseFilters({}))).toHaveLength(0);
    expect((await loadSummary(b, parseFilters({}))).hasData).toBe(false);
    // un id de campaña de A usado desde B no devuelve datos
    expect(await loadAds(b, parseFilters({ campaign: camp.id }))).toHaveLength(0);
  });
});
