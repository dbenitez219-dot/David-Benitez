import { db } from "@/lib/db";

/**
 * Datos de DEMOSTRACIÓN (ficticios). Se guardan en una cuenta con isDemo=true para que
 * la interfaz siempre los identifique como tales. Generación determinista (sin azar real).
 */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Objective = "MESSAGES" | "LEADS" | "SALES";
type Quality = "winner" | "good" | "mid" | "low" | "loser";
const FACTOR: Record<Quality, number> = { winner: 0.6, good: 0.85, mid: 1.1, low: 1.4, loser: 2.3 };
const BASE_CPR: Record<Objective, number> = { MESSAGES: 8_000, LEADS: 15_000, SALES: 60_000 };

type AdSpec = { name: string; q: Quality; startedDaysAgo: number; dailySpend: number; pausedAfter?: number };
type SetSpec = { name: string; ads: AdSpec[] };
type CampSpec = { name: string; objective: Objective; sets: SetSpec[] };

const CAMPAIGNS: CampSpec[] = [
  { name: "Mensajes WhatsApp – Servicios", objective: "MESSAGES", sets: [
    { name: "Asunción 25-45", ads: [
      { name: "Video testimonio", q: "winner", startedDaysAgo: 55, dailySpend: 90_000 },
      { name: "Carrusel de precios", q: "good", startedDaysAgo: 50, dailySpend: 60_000 },
      { name: "Imagen promo -20%", q: "loser", startedDaysAgo: 40, dailySpend: 50_000 } ] },
    { name: "Lookalike clientes", ads: [
      { name: "Video antes/después", q: "good", startedDaysAgo: 45, dailySpend: 70_000 },
      { name: "Reel del taller", q: "mid", startedDaysAgo: 1, dailySpend: 40_000 } ] } ] },
  { name: "Captación de leads – Formulario", objective: "LEADS", sets: [
    { name: "Intereses automotor", ads: [
      { name: "Formulario corto", q: "winner", startedDaysAgo: 50, dailySpend: 80_000 },
      { name: "Formulario largo", q: "low", startedDaysAgo: 48, dailySpend: 55_000 },
      { name: "Oferta limitada", q: "loser", startedDaysAgo: 40, dailySpend: 45_000, pausedAfter: 20 } ] } ] },
  { name: "Ventas tienda online", objective: "SALES", sets: [
    { name: "Retargeting", ads: [
      { name: "Catálogo dinámico", q: "winner", startedDaysAgo: 55, dailySpend: 100_000 },
      { name: "Banner descuento", q: "mid", startedDaysAgo: 40, dailySpend: 60_000 } ] },
    { name: "Prospecting", ads: [
      { name: "Video de producto", q: "low", startedDaysAgo: 45, dailySpend: 70_000 },
      { name: "Creativo nuevo", q: "mid", startedDaysAgo: 1, dailySpend: 50_000 } ] } ] },
];

const DAY = 86_400_000;
const todayUtc = () => { const n = new Date(); return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()); };

export async function seedDemo(organizationId: string): Promise<{ created: boolean }> {
  const existing = await db.adAccount.findFirst({ where: { organizationId, isDemo: true } });
  if (existing) return { created: false };
  const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { currency: true } });
  const rand = rng(1234);
  const today = todayUtc();

  await db.$transaction(async (tx) => {
    const acct = await tx.adAccount.create({
      data: { organizationId, platform: "META", externalId: "demo_account", name: "Cuenta DEMO (datos ficticios)", currency: org.currency, isDemo: true },
    });
    for (const [ci, c] of CAMPAIGNS.entries()) {
      const camp = await tx.campaign.create({ data: { organizationId, adAccountId: acct.id, externalId: `demo_c${ci}`, name: c.name, objective: c.objective, status: "ACTIVE" } });
      for (const [si, s] of c.sets.entries()) {
        const set = await tx.adSet.create({ data: { organizationId, campaignId: camp.id, externalId: `demo_c${ci}_s${si}`, name: s.name, status: "ACTIVE" } });
        for (const [ai, a] of s.ads.entries()) {
          const paused = a.pausedAfter !== undefined;
          const ad = await tx.ad.create({
            data: {
              organizationId, adSetId: set.id, externalId: `demo_c${ci}_s${si}_a${ai}`, name: a.name,
              status: paused ? "PAUSED" : "ACTIVE", startTime: new Date(today - a.startedDaysAgo * DAY),
            },
          });
          const rows = [];
          for (let d = Math.min(a.startedDaysAgo, 120); d >= 0; d--) {
            if (paused && a.startedDaysAgo - d > a.pausedAfter!) break;
            const spend = Math.round(a.dailySpend * (0.8 + rand() * 0.4));
            const cpr = BASE_CPR[c.objective] * FACTOR[a.q] * (0.75 + rand() * 0.5);
            const results = Math.round(spend / cpr);
            const ctr = (a.q === "winner" ? 0.022 : a.q === "loser" ? 0.009 : 0.015) * (0.85 + rand() * 0.3);
            const clicks = Math.max(results, Math.round(results / 0.09));
            const impressions = Math.round(clicks / ctr);
            const ticket = 250_000 * (0.8 + rand() * 0.4);
            rows.push({
              organizationId, adId: ad.id, date: new Date(today - d * DAY), spend, impressions, reach: Math.round(impressions * 0.72), clicks,
              messages: c.objective === "MESSAGES" ? results : 0, leads: c.objective === "LEADS" ? results : 0,
              conversions: c.objective === "SALES" ? results : 0, revenue: c.objective === "SALES" ? Math.round(results * ticket) : null,
            });
          }
          await tx.adInsightDaily.createMany({ data: rows });
        }
      }
    }
  }, { timeout: 60_000 });
  return { created: true };
}

export async function removeDemo(organizationId: string): Promise<number> {
  const r = await db.adAccount.deleteMany({ where: { organizationId, isDemo: true } });
  return r.count;
}
