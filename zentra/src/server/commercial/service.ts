import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/server/audit/audit";
import { requireFeature } from "@/server/billing/access";
import { ServiceError } from "@/server/errors";

type Who = { organizationId: string; userId: string };
const text = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));
const money = z.coerce.number().min(0).max(1e12);

const leadInput = z.object({ name: z.string().trim().min(1).max(120), phone: text(40), email: text(120), source: text(80), campaignExternalId: text(80) });
const saleInput = z.object({
  customerId: text(40), customerName: text(120), customerPhone: text(40), campaignExternalId: text(80),
  revenue: money.refine((n) => n > 0, "El ingreso debe ser mayor que 0"), cost: money.default(0), soldAt: z.coerce.date().optional(), note: text(200),
});

/** La campaña de atribución debe existir en la organización (se guarda su id externo, estable entre sincronizaciones). */
async function checkCampaign(organizationId: string, externalId?: string) {
  if (!externalId) return null;
  const c = await db.campaign.findFirst({ where: { organizationId, externalId } });
  if (!c) throw new ServiceError("La campaña elegida no existe.");
  return externalId;
}

export async function createLead(p: Who, raw: unknown) {
  await requireFeature(p.organizationId, "commercial");
  const i = leadInput.parse(raw);
  const lead = await db.lead.create({ data: { organizationId: p.organizationId, name: i.name, phone: i.phone, email: i.email, source: i.source, campaignExternalId: await checkCampaign(p.organizationId, i.campaignExternalId) } });
  await audit({ action: "commercial.lead_create", userId: p.userId, organizationId: p.organizationId, entity: "Lead", entityId: lead.id });
  return lead;
}

export async function setLeadStatus(p: Who, id: string, status: "NEW" | "CONTACTED" | "WON" | "LOST") {
  await requireFeature(p.organizationId, "commercial");
  const r = await db.lead.updateMany({ where: { id, organizationId: p.organizationId }, data: { status } });
  if (r.count === 0) throw new ServiceError("Lead no encontrado.");
}

/** Convierte un lead en cliente (conserva la campaña de origen) y lo marca como ganado. */
export async function convertLead(p: Who, id: string) {
  await requireFeature(p.organizationId, "commercial");
  const lead = await db.lead.findFirst({ where: { id, organizationId: p.organizationId } });
  if (!lead) throw new ServiceError("Lead no encontrado.");
  const customer = await db.customer.create({ data: { organizationId: p.organizationId, name: lead.name ?? "Sin nombre", phone: lead.phone, email: lead.email, campaignExternalId: lead.campaignExternalId } });
  await db.lead.update({ where: { id: lead.id }, data: { status: "WON" } });
  await audit({ action: "commercial.lead_convert", userId: p.userId, organizationId: p.organizationId, entity: "Customer", entityId: customer.id });
  return customer;
}

export async function deleteLead(p: Who, id: string) {
  await requireFeature(p.organizationId, "commercial");
  const r = await db.lead.deleteMany({ where: { id, organizationId: p.organizationId } });
  if (r.count === 0) throw new ServiceError("Lead no encontrado.");
}

/** Registra una venta REAL (ingreso y costo). Crea el cliente si se indica su nombre. */
export async function createSale(p: Who, raw: unknown) {
  await requireFeature(p.organizationId, "commercial");
  const i = saleInput.parse(raw);
  const org = await db.organization.findUniqueOrThrow({ where: { id: p.organizationId }, select: { currency: true } });
  const campaign = await checkCampaign(p.organizationId, i.campaignExternalId);
  let customerId: string | null = null;
  if (i.customerId) {
    const c = await db.customer.findFirst({ where: { id: i.customerId, organizationId: p.organizationId } });
    if (!c) throw new ServiceError("Cliente no encontrado.");
    customerId = c.id;
  } else if (i.customerName) {
    customerId = (await db.customer.create({ data: { organizationId: p.organizationId, name: i.customerName, phone: i.customerPhone, campaignExternalId: campaign } })).id;
  }
  const sale = await db.sale.create({ data: { organizationId: p.organizationId, customerId, campaignExternalId: campaign, revenue: i.revenue, cost: i.cost, currency: org.currency, soldAt: i.soldAt ?? new Date(), note: i.note } });
  await audit({ action: "commercial.sale_create", userId: p.userId, organizationId: p.organizationId, entity: "Sale", entityId: sale.id });
  return sale;
}

export async function deleteSale(p: Who, id: string) {
  await requireFeature(p.organizationId, "commercial");
  const r = await db.sale.deleteMany({ where: { id, organizationId: p.organizationId } });
  if (r.count === 0) throw new ServiceError("Venta no encontrada.");
  await audit({ action: "commercial.sale_delete", userId: p.userId, organizationId: p.organizationId, entity: "Sale", entityId: id });
}

export type CampaignRow = { externalId: string | null; name: string; spend: number; leads: number; customers: number; sales: number; revenue: number; cost: number; profit: number; costPerCustomer: number | null; roas: number | null };

/**
 * Rentabilidad REAL: combina lo que Meta dice que gastaste con las ventas que TÚ registraste.
 * Nada se infiere: un mensaje o un lead no es una venta; sin ventas registradas, el costo por cliente es "sin datos".
 */
export async function commercialSummary(organizationId: string, from: Date, to: Date) {
  const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { currency: true } });
  const end = new Date(to.getTime() + 86_400_000); // [from, to] inclusivo
  const [sales, customers, leads, campaigns, insights, accounts] = await Promise.all([
    db.sale.findMany({ where: { organizationId, soldAt: { gte: from, lt: end } } }),
    db.customer.findMany({ where: { organizationId, createdAt: { gte: from, lt: end } } }),
    db.lead.findMany({ where: { organizationId, createdAt: { gte: from, lt: end } } }),
    db.campaign.findMany({ where: { organizationId }, select: { externalId: true, name: true } }),
    db.adInsightDaily.findMany({ where: { organizationId, date: { gte: from, lte: to } }, select: { spend: true, ad: { select: { adSet: { select: { campaign: { select: { externalId: true } } } } } } } }),
    db.adAccount.findMany({ where: { organizationId }, select: { currency: true } }),
  ]);
  const inCur = sales.filter((s) => s.currency === org.currency);
  const names = new Map(campaigns.map((c) => [c.externalId, c.name]));
  const rows = new Map<string | null, CampaignRow>();
  const row = (id: string | null) => {
    const key = id && names.has(id) ? id : null;
    if (!rows.has(key)) rows.set(key, { externalId: key, name: key ? names.get(key)! : "Sin campaña atribuida", spend: 0, leads: 0, customers: 0, sales: 0, revenue: 0, cost: 0, profit: 0, costPerCustomer: null, roas: null });
    return rows.get(key)!;
  };
  for (const i of insights) row(i.ad.adSet.campaign.externalId).spend += Number(i.spend);
  for (const l of leads) row(l.campaignExternalId).leads++;
  for (const c of customers) row(c.campaignExternalId).customers++;
  for (const s of inCur) { const r = row(s.campaignExternalId); r.sales++; r.revenue += Number(s.revenue); r.cost += Number(s.cost); }
  for (const r of rows.values()) { r.profit = r.revenue - r.cost - r.spend; r.costPerCustomer = r.customers ? r.spend / r.customers : null; r.roas = r.spend > 0 && r.revenue > 0 ? r.revenue / r.spend : null; }

  const spend = [...rows.values()].reduce((a, r) => a + r.spend, 0);
  const revenue = inCur.reduce((a, s) => a + Number(s.revenue), 0), saleCost = inCur.reduce((a, s) => a + Number(s.cost), 0);
  return {
    currency: org.currency, spend, revenue, saleCost, grossProfit: revenue - saleCost, netProfit: revenue - saleCost - spend,
    marginPct: revenue > 0 ? ((revenue - saleCost - spend) / revenue) * 100 : null,
    leads: leads.length, customers: customers.length, sales: inCur.length,
    costPerCustomer: customers.length ? spend / customers.length : null,
    roas: spend > 0 && revenue > 0 ? revenue / spend : null,
    excludedSales: sales.length - inCur.length, // ventas en otra moneda: no se mezclan
    currencyWarning: accounts.some((a) => a.currency && a.currency !== org.currency),
    campaigns: [...rows.values()].sort((a, b) => b.spend - a.spend),
  };
}
