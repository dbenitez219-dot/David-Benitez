import { db } from "@/lib/db";

export type PlanId = "START" | "BUSINESS" | "AGENCY";
export const PLAN_IDS: PlanId[] = ["START", "BUSINESS", "AGENCY"];

export type Entitlements = {
  maxAdAccounts: number; // cuentas publicitarias sincronizables
  ai: "none" | "basic" | "advanced"; // basic = respuestas por reglas; advanced = IA conversacional
  maxRules: number; // reglas de automatización
  commercial: boolean; // análisis comercial (clientes, ventas, rentabilidad)
  advancedReports: boolean;
  multiClient: boolean; // gestión de varios clientes (Agency)
  roles: boolean;
};

/** Sin suscripción vigente: los datos se conservan, pero las funciones premium quedan limitadas. */
export const LIMITED: Entitlements = { maxAdAccounts: 0, ai: "none", maxRules: 0, commercial: false, advancedReports: false, multiClient: false, roles: false };

export const PLAN_CATALOG: Record<PlanId, { name: string; description: string; highlights: string[]; entitlements: Entitlements; prices: { countryCode: string; currency: string; amountMinor: number }[] }> = {
  START: {
    name: "Start", description: "Para empezar con una cuenta publicitaria.",
    highlights: ["1 cuenta publicitaria", "Análisis y clasificación de anuncios", "Alertas", "Automatizaciones básicas (hasta 2 reglas)", "Informes"],
    entitlements: { maxAdAccounts: 1, ai: "basic", maxRules: 2, commercial: false, advancedReports: false, multiClient: false, roles: false },
    prices: [{ countryCode: "PY", currency: "PYG", amountMinor: 99_999 }],
  },
  BUSINESS: {
    name: "Business", description: "Para negocios que quieren medir ventas reales.",
    highlights: ["Hasta 3 cuentas publicitarias", "Todo lo de Start", "IA avanzada (ZENTRA AI conversacional)", "Automatizaciones personalizadas (hasta 20 reglas)", "Análisis comercial", "Informes avanzados"],
    entitlements: { maxAdAccounts: 3, ai: "advanced", maxRules: 20, commercial: true, advancedReports: true, multiClient: false, roles: false },
    prices: [{ countryCode: "PY", currency: "PYG", amountMinor: 199_999 }],
  },
  AGENCY: {
    name: "Agency", description: "Para agencias que gestionan varios clientes.",
    highlights: ["Hasta 10 cuentas publicitarias", "Gestión de múltiples clientes", "Panel centralizado", "Automatizaciones avanzadas (hasta 100 reglas)", "Informes para clientes", "Roles y permisos"],
    entitlements: { maxAdAccounts: 10, ai: "advanced", maxRules: 100, commercial: true, advancedReports: true, multiClient: true, roles: true },
    prices: [{ countryCode: "PY", currency: "PYG", amountMinor: 399_999 }],
  },
};

export const TRIAL_DAYS = 7;

/** Crea/actualiza el catálogo (idempotente). Los precios existentes NO se pisan: el administrador puede haberlos cambiado. */
export async function ensurePlans() {
  for (const id of PLAN_IDS) {
    const p = PLAN_CATALOG[id];
    await db.plan.upsert({ where: { id }, update: { name: p.name, maxAdAccounts: p.entitlements.maxAdAccounts, features: p.entitlements }, create: { id, name: p.name, maxAdAccounts: p.entitlements.maxAdAccounts, features: p.entitlements } });
    for (const pr of p.prices)
      await db.planPrice.upsert({ where: { planId_countryCode_currency: { planId: id, countryCode: pr.countryCode, currency: pr.currency } }, update: {}, create: { planId: id, ...pr } });
  }
}

/**
 * Precio de un plan para un país. NO hay conversión automática desde otros países/monedas:
 * si el administrador no definió un precio para ese país, el plan no está disponible para pago ahí.
 */
export async function priceFor(planId: string, countryCode: string | null | undefined) {
  if (!countryCode) return null;
  return db.planPrice.findFirst({ where: { planId, countryCode: countryCode.toUpperCase(), active: true }, orderBy: { amountMinor: "asc" } });
}

/** Desglose de impuesto. Con taxIncluded el precio ya lo contiene; si no, se suma. Todo en unidad mínima de la moneda. */
export function taxBreakdown(amountMinor: number, taxIncluded: boolean, taxPercent: number | null) {
  if (!taxPercent) return { net: amountMinor, tax: 0, total: amountMinor };
  if (taxIncluded) { const net = Math.round(amountMinor / (1 + taxPercent / 100)); return { net, tax: amountMinor - net, total: amountMinor }; }
  const tax = Math.round((amountMinor * taxPercent) / 100);
  return { net: amountMinor, tax, total: amountMinor + tax };
}

/** Suma meses de calendario (31 ene + 1 mes = 28/29 feb). */
export function addMonths(d: Date, n: number): Date {
  const r = new Date(d.getTime());
  const day = r.getUTCDate();
  r.setUTCDate(1); r.setUTCMonth(r.getUTCMonth() + n);
  const last = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(day, last));
  return r;
}
