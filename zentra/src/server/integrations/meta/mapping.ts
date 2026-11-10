/** Transformaciones puras Graph API → modelo de ZENTRA (fáciles de probar). */
export type ResultObjective = "MESSAGES" | "LEADS" | "SALES";

const SALES = new Set(["OUTCOME_SALES", "CONVERSIONS", "PRODUCT_CATALOG_SALES"]);
const LEADS = new Set(["OUTCOME_LEADS", "LEAD_GENERATION"]);

/**
 * Objetivo de resultado. Limitación conocida: campañas con otros objetivos (tráfico, interacción, etc.)
 * se tratan como MENSAJES; el motor de la Fase 4 afinará esto con el destino real del conjunto de anuncios.
 */
export function resultObjective(raw: string | null | undefined): ResultObjective {
  if (raw && SALES.has(raw)) return "SALES";
  if (raw && LEADS.has(raw)) return "LEADS";
  return "MESSAGES";
}

/** ACTIVE/PAUSED se mantienen; los demás estados efectivos se guardan tal cual (DISAPPROVED, ARCHIVED…). */
export function mapStatus(effective: string | null | undefined, configured?: string | null): string {
  const s = effective ?? configured ?? "UNKNOWN";
  if (s === "ACTIVE") return "ACTIVE";
  if (s === "PAUSED" || s === "CAMPAIGN_PAUSED" || s === "ADSET_PAUSED") return "PAUSED";
  return s;
}

export const currencyDecimals = (currency: string | null | undefined) => {
  try { return new Intl.NumberFormat("en", { style: "currency", currency: currency || "USD" }).resolvedOptions().maximumFractionDigits ?? 2; } catch { return 2; }
};

/** Meta entrega los presupuestos en la unidad mínima de la moneda (centavos). */
export function budgetToMajor(minor: string | number | null | undefined, currency: string | null | undefined): number | null {
  if (minor === null || minor === undefined || minor === "") return null;
  const n = Number(minor);
  return Number.isFinite(n) ? n / 10 ** currencyDecimals(currency) : null;
}

export const safeHttpsUrl = (u: unknown): string | null => (typeof u === "string" && /^https:\/\//i.test(u) && u.length < 2000 ? u : null);

type Action = { action_type: string; value: string };

// Se toma el PRIMER tipo disponible (no se suman) para no contar dos veces el mismo evento.
const MESSAGE_TYPES = ["onsite_conversion.messaging_conversation_started_7d"];
const LEAD_TYPES = ["lead", "onsite_conversion.lead_grouped"];
const PURCHASE_TYPES = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"];

function pick(list: Action[] | undefined, types: string[]): number {
  for (const t of types) {
    const a = list?.find((x) => x.action_type === t);
    if (a) return Number(a.value) || 0;
  }
  return 0;
}
function pickPresent(list: Action[] | undefined, types: string[]): number | null {
  for (const t of types) {
    const a = list?.find((x) => x.action_type === t);
    if (a) return Number(a.value) || 0;
  }
  return null;
}

export type GraphInsight = {
  ad_id: string; date_start: string; spend?: string; impressions?: string; reach?: string; clicks?: string;
  actions?: Action[]; action_values?: Action[];
};

export function mapInsight(r: GraphInsight) {
  return {
    adExternalId: r.ad_id,
    date: new Date(`${r.date_start}T00:00:00Z`),
    spend: Number(r.spend ?? 0),
    impressions: Math.round(Number(r.impressions ?? 0)),
    reach: r.reach !== undefined ? Math.round(Number(r.reach)) : null,
    clicks: Math.round(Number(r.clicks ?? 0)),
    messages: pick(r.actions, MESSAGE_TYPES),
    leads: pick(r.actions, LEAD_TYPES),
    conversions: pick(r.actions, PURCHASE_TYPES),
    revenue: pickPresent(r.action_values, PURCHASE_TYPES), // solo si Meta informa valor de compra
  };
}
