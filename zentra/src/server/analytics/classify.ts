import type { AdClassification } from "@prisma/client";
import type { Objective, Totals } from "./metrics";

/**
 * Clasificación básica (Fase 2). El motor completo y configurable por cliente llega en la Fase 4/5.
 * Principio: sin datos suficientes NO se juzga un anuncio.
 */
export type ClassifyConfig = {
  minSpend: number; // gasto mínimo para evaluar (en la moneda de la cuenta)
  minDays: number; // días mínimos con actividad
  minImpressions: number;
};

export const DEFAULT_CONFIG: ClassifyConfig = { minSpend: 50_000, minDays: 3, minImpressions: 1000 };

export type ClassifyInput = { objective: Objective; totals: Totals; activeDays: number };

export const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function hasEnoughData(i: ClassifyInput, c: ClassifyConfig = DEFAULT_CONFIG) {
  return i.totals.spend >= c.minSpend && i.activeDays >= c.minDays && i.totals.impressions >= c.minImpressions;
}

/** Mediana del costo por resultado por objetivo, usando solo anuncios con datos suficientes y resultados. */
export function benchmarks(items: ClassifyInput[], c: ClassifyConfig = DEFAULT_CONFIG): Partial<Record<Objective, number>> {
  const out: Partial<Record<Objective, number>> = {};
  for (const obj of ["MESSAGES", "LEADS", "SALES"] as Objective[]) {
    const cprs = items.filter((i) => i.objective === obj && hasEnoughData(i, c) && i.totals.results > 0).map((i) => i.totals.spend / i.totals.results);
    const m = median(cprs);
    if (m !== null) out[obj] = m;
  }
  return out;
}

export function classify(i: ClassifyInput, bench: Partial<Record<Objective, number>>, c: ClassifyConfig = DEFAULT_CONFIG): AdClassification {
  if (!hasEnoughData(i, c)) return "INSUFFICIENT_DATA";
  if (i.totals.results === 0) return i.totals.spend >= c.minSpend * 2 ? "LOSER" : "WATCH";
  const ref = bench[i.objective];
  if (!ref) return "INSUFFICIENT_DATA";
  const rel = i.totals.spend / i.totals.results / ref;
  if (rel <= 0.7) return "WINNER";
  if (rel <= 0.95) return "GOOD";
  if (rel <= 1.2) return "WATCH";
  if (rel <= 1.6) return "LOW";
  return "LOSER";
}
