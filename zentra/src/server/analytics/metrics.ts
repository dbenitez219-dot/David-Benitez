export type Objective = "MESSAGES" | "LEADS" | "SALES";

export type Totals = {
  spend: number; impressions: number; reach: number; clicks: number;
  messages: number; leads: number; conversions: number; revenue: number; results: number;
};

export type InsightRow = {
  spend: number; impressions: number; reach: number | null; clicks: number;
  messages: number; leads: number; conversions: number; revenue: number | null;
};

export const emptyTotals = (): Totals => ({ spend: 0, impressions: 0, reach: 0, clicks: 0, messages: 0, leads: 0, conversions: 0, revenue: 0, results: 0 });

/**
 * "Resultado" depende del objetivo de la campaña. Un mensaje NO equivale a una venta:
 * solo las campañas de ventas cuentan conversiones como resultado.
 */
export function resultsFor(objective: Objective, r: Pick<InsightRow, "messages" | "leads" | "conversions">): number {
  if (objective === "MESSAGES") return r.messages;
  if (objective === "LEADS") return r.leads;
  return r.conversions;
}

export function addRow(t: Totals, r: InsightRow, objective: Objective): Totals {
  t.spend += r.spend; t.impressions += r.impressions; t.reach += r.reach ?? 0; t.clicks += r.clicks;
  t.messages += r.messages; t.leads += r.leads; t.conversions += r.conversions; t.revenue += r.revenue ?? 0;
  t.results += resultsFor(objective, r);
  return t;
}

export type Derived = {
  ctr: number | null; cpc: number | null; cpm: number | null;
  costPerResult: number | null; roas: number | null; frequency: number | null;
};

const div = (a: number, b: number) => (b > 0 ? a / b : null);

export function derive(t: Totals): Derived {
  return {
    ctr: div(t.clicks * 100, t.impressions),
    cpc: div(t.spend, t.clicks),
    cpm: div(t.spend * 1000, t.impressions),
    costPerResult: div(t.spend, t.results),
    roas: t.revenue > 0 ? div(t.revenue, t.spend) : null, // solo si hay ingresos informados
    frequency: div(t.impressions, t.reach), // aproximada: el alcance diario no es sumable exactamente
  };
}

/** Variación porcentual contra el período anterior; null si no hay base de comparación. */
export function delta(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export type Trend = "UP" | "FLAT" | "DOWN" | null;

/** Tendencia: eficiencia (resultados por gasto) de la segunda mitad frente a la primera. */
export function trendOf(daily: { spend: number; results: number }[]): Trend {
  if (daily.length < 4) return null;
  const mid = Math.floor(daily.length / 2);
  const eff = (xs: typeof daily) => {
    const s = xs.reduce((a, b) => a + b.spend, 0);
    const r = xs.reduce((a, b) => a + b.results, 0);
    return s > 0 ? r / s : null;
  };
  const a = eff(daily.slice(0, mid)), b = eff(daily.slice(mid));
  if (a === null || b === null || a === 0) return null;
  const ch = (b - a) / a;
  return ch > 0.1 ? "UP" : ch < -0.1 ? "DOWN" : "FLAT";
}
