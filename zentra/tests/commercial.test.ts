import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { registerUser } from "@/server/auth/service";
import { answerWithRules } from "@/server/ai/rules";
import { makeToolRunner } from "@/server/ai/tools";
import { commercialSummary, convertLead, createLead, createSale, deleteLead, deleteSale, setLeadStatus } from "@/server/commercial/service";
import { ServiceError } from "@/server/errors";

const DAY = 86_400_000;
async function mk(email: string) {
  const r = await registerUser({ name: "T", email, password: "Correcta12345", organizationName: "Org", planId: "BUSINESS" });
  if (!r.ok) throw new Error("registro");
  const organizationId = r.data.organizationId as string;
  const acct = await db.adAccount.create({ data: { organizationId, platform: "META", externalId: "act_1", name: "C", currency: "PYG", isDemo: false } });
  const camp = async (externalId: string, name: string) => {
    const c = await db.campaign.create({ data: { organizationId, adAccountId: acct.id, externalId, name, objective: "MESSAGES", status: "ACTIVE" } });
    const s = await db.adSet.create({ data: { organizationId, campaignId: c.id, externalId: `s_${externalId}`, name: "S", status: "ACTIVE" } });
    const ad = await db.ad.create({ data: { organizationId, adSetId: s.id, externalId: `a_${externalId}`, name: "A", status: "ACTIVE" } });
    return ad;
  };
  return { organizationId, userId: r.data.userId, camp };
}
const spendOn = async (organizationId: string, adId: string, daysAgo: number, spend: number) => {
  const n = new Date(); const d = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()) - daysAgo * DAY);
  await db.adInsightDaily.create({ data: { organizationId, adId, date: d, spend, impressions: 1000, clicks: 10, messages: 5 } });
};
const range = (days: number) => { const n = new Date(); const to = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate())); return { from: new Date(to.getTime() - (days - 1) * DAY), to }; };

beforeEach(async () => { await db.rateLimit.deleteMany(); await db.auditLog.deleteMany(); await db.organization.deleteMany(); await db.user.deleteMany(); });
afterAll(() => db.$disconnect());

describe("ventas, clientes y leads", () => {
  it("valida entradas y exige que la campaña exista en la organización", async () => {
    const a = await mk("a@x.com"), b = await mk("b@x.com");
    await a.camp("c1", "Campaña A");
    await expect(createSale(a, { revenue: 0 })).rejects.toThrow();
    await expect(createSale(a, { revenue: -5 })).rejects.toThrow();
    await expect(createSale(a, { revenue: 100, campaignExternalId: "no_existe" })).rejects.toThrow(/no existe/);
    await expect(createSale(b, { revenue: 100, campaignExternalId: "c1" })).rejects.toThrow(/no existe/); // la campaña es de otra organización
    const s = await createSale(a, { revenue: 250000, cost: 100000, campaignExternalId: "c1", customerName: "Juan", customerPhone: "0981" });
    expect(s).toMatchObject({ currency: "PYG", campaignExternalId: "c1" }); expect(s.customerId).toBeTruthy();
    expect((await db.customer.findUniqueOrThrow({ where: { id: s.customerId! } })).campaignExternalId).toBe("c1");
  });
  it("una organización no puede tocar ni vincular datos de otra", async () => {
    const a = await mk("a@x.com"), b = await mk("b@x.com");
    const sale = await createSale(a, { revenue: 100, customerName: "X" });
    const lead = await createLead(a, { name: "L" });
    await expect(deleteSale(b, sale.id)).rejects.toBeInstanceOf(ServiceError);
    await expect(deleteLead(b, lead.id)).rejects.toBeInstanceOf(ServiceError);
    await expect(setLeadStatus(b, lead.id, "LOST")).rejects.toBeInstanceOf(ServiceError);
    await expect(convertLead(b, lead.id)).rejects.toBeInstanceOf(ServiceError);
    await expect(createSale(b, { revenue: 5, customerId: sale.customerId! })).rejects.toThrow(/Cliente no encontrado/);
    expect(await db.sale.count({ where: { organizationId: a.organizationId } })).toBe(1);
    await deleteSale(a, sale.id); expect(await db.sale.count()).toBe(0);
  });
  it("convertir un lead crea el cliente con su campaña de origen y lo marca como ganado", async () => {
    const a = await mk("a@x.com"); await a.camp("c1", "K");
    const lead = await createLead(a, { name: "María", phone: "0991", campaignExternalId: "c1" });
    const c = await convertLead(a, lead.id);
    expect(c).toMatchObject({ name: "María", campaignExternalId: "c1" });
    expect((await db.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe("WON");
  });
});

describe("rentabilidad real", () => {
  it("combina la inversión de Meta con las ventas registradas: costo por cliente, ROAS y ganancia reales", async () => {
    const a = await mk("a@x.com");
    const ad1 = await a.camp("c1", "Campaña 1"), ad2 = await a.camp("c2", "Campaña 2");
    await spendOn(a.organizationId, ad1.id, 1, 100_000); await spendOn(a.organizationId, ad1.id, 2, 100_000); await spendOn(a.organizationId, ad2.id, 1, 50_000);
    await createSale(a, { revenue: 300_000, cost: 100_000, campaignExternalId: "c1", customerName: "Uno" });
    await createSale(a, { revenue: 200_000, cost: 50_000, campaignExternalId: "c1", customerName: "Dos" });
    await createSale(a, { revenue: 80_000, cost: 20_000, customerName: "Sin campaña" });
    const { from, to } = range(7);
    const s = await commercialSummary(a.organizationId, from, to);
    expect(s).toMatchObject({ spend: 250_000, revenue: 580_000, saleCost: 170_000, grossProfit: 410_000, netProfit: 160_000, sales: 3, customers: 3 });
    expect(s.costPerCustomer).toBeCloseTo(250_000 / 3); expect(s.roas).toBeCloseTo(580_000 / 250_000);
    const c1 = s.campaigns.find((c) => c.externalId === "c1")!;
    expect(c1).toMatchObject({ spend: 200_000, customers: 2, sales: 2, revenue: 500_000, cost: 150_000, profit: 150_000, costPerCustomer: 100_000 });
    expect(c1.roas).toBeCloseTo(2.5);
    const c2 = s.campaigns.find((c) => c.externalId === "c2")!;
    expect(c2).toMatchObject({ spend: 50_000, sales: 0, costPerCustomer: null, roas: null, profit: -50_000 }); // gastó sin vender: no se inventa un costo por cliente
    const none = s.campaigns.find((c) => c.externalId === null)!;
    expect(none).toMatchObject({ name: "Sin campaña atribuida", revenue: 80_000, spend: 0 });
  });
  it("sin ventas registradas no inventa nada", async () => {
    const a = await mk("a@x.com"); const ad = await a.camp("c1", "K"); await spendOn(a.organizationId, ad.id, 1, 100_000);
    const { from, to } = range(7); const s = await commercialSummary(a.organizationId, from, to);
    expect(s).toMatchObject({ sales: 0, customers: 0, costPerCustomer: null, roas: null, marginPct: null, netProfit: -100_000 });
  });
  it("respeta el período, no mezcla monedas y aísla organizaciones", async () => {
    const a = await mk("a@x.com"), b = await mk("b@x.com");
    await createSale(a, { revenue: 100, soldAt: new Date(Date.now() - 40 * DAY) }); // fuera del período
    await createSale(a, { revenue: 200 });
    await db.sale.create({ data: { organizationId: a.organizationId, revenue: 999, currency: "USD" } });
    const { from, to } = range(30);
    const s = await commercialSummary(a.organizationId, from, to);
    expect(s).toMatchObject({ sales: 1, revenue: 200, excludedSales: 1 });
    expect((await commercialSummary(b.organizationId, from, to)).sales).toBe(0);
  });
});

describe("el asistente usa las ventas reales", () => {
  it("responde el costo por cliente y las ventas con los datos registrados", async () => {
    const a = await mk("a@x.com"); const ad = await a.camp("c1", "Campaña 1"); await spendOn(a.organizationId, ad.id, 1, 100_000);
    await createSale(a, { revenue: 400_000, cost: 100_000, campaignExternalId: "c1", customerName: "Cli" });
    const run = makeToolRunner({ organizationId: a.organizationId, currency: "PYG" });
    const cpc = await answerWithRules("¿Cuál es mi costo por cliente?", run, "PYG");
    expect(cpc.text).toContain("Costo real por cliente"); expect(cpc.text).toContain("100.000");
    const ventas = await answerWithRules("¿Qué campaña genera más ventas?", run, "PYG");
    expect(ventas.text).toContain("Campaña 1"); expect(ventas.text).toContain("Ventas que registraste");
    const b = await mk("b@x.com");
    const sinDatos = await answerWithRules("¿Cuál es mi costo por cliente?", makeToolRunner({ organizationId: b.organizationId, currency: "PYG" }), "PYG");
    expect(sinDatos.text).not.toContain("Costo real por cliente");
  });
});
