import type { AdClassification } from "@prisma/client";
import type { Objective, Totals } from "./metrics";

/**
 * Motor de clasificación. Reglas:
 *  1. Sin datos suficientes NO se juzga un anuncio.
 *  2. Referencia = costo objetivo del cliente (si lo configuró) o, si no, la mediana de sus propios anuncios del mismo objetivo.
 *  3. Cada clasificación trae su motivo en lenguaje sencillo, para poder verificarla.
 */
export type ClassifyConfig = {
  minSpend: number; // gasto mínimo para evaluar (en la moneda de la cuenta)
  minDays: number; // días mínimos con actividad
  minImpressions: number;
  targets?: Partial<Record<Objective, number | undefined>>; // costo objetivo por resultado
};

export const DEFAULT_CONFIG: ClassifyConfig = { minSpend: 50_000, minDays: 3, minImpressions: 1000 };

export type ClassifyInput = { objective: Objective; totals: Totals; activeDays: number };
export type RefKind = "target" | "median" | null;
export type Verdict = { classification: AdClassification; reason: string; reference: number | null; refKind: RefKind; missing: string[] };

export const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function missingData(i: ClassifyInput, c: ClassifyConfig = DEFAULT_CONFIG): string[] {
  const out: string[] = [];
  if (i.totals.spend < c.minSpend) out.push(`gasto mínimo (${Math.round(i.totals.spend)} de ${c.minSpend})`);
  if (i.activeDays < c.minDays) out.push(`días activos (${i.activeDays} de ${c.minDays})`);
  if (i.totals.impressions < c.minImpressions) out.push(`impresiones (${i.totals.impressions} de ${c.minImpressions})`);
  return out;
}
export const hasEnoughData = (i: ClassifyInput, c: ClassifyConfig = DEFAULT_CONFIG) => missingData(i, c).length === 0;

/** Mediana del costo por resultado por objetivo (solo anuncios con datos suficientes y al menos un resultado). */
export function benchmarks(items: ClassifyInput[], c: ClassifyConfig = DEFAULT_CONFIG): Partial<Record<Objective, number>> {
  const out: Partial<Record<Objective, number>> = {};
  for (const obj of ["MESSAGES", "LEADS", "SALES"] as Objective[]) {
    const cprs = items.filter((i) => i.objective === obj && hasEnoughData(i, c) && i.totals.results > 0).map((i) => i.totals.spend / i.totals.results);
    const m = median(cprs);
    if (m !== null) out[obj] = m;
  }
  return out;
}

export function classifyDetailed(i: ClassifyInput, bench: Partial<Record<Objective, number>>, c: ClassifyConfig = DEFAULT_CONFIG): Verdict {
  const miss = missingData(i, c);
  if (miss.length) return { classification: "INSUFFICIENT_DATA", reason: `Aún no hay datos suficientes para juzgarlo. Falta: ${miss.join(", ")}.`, reference: null, refKind: null, missing: miss };
  if (i.totals.results === 0) {
    const bad = i.totals.spend >= c.minSpend * 2;
    return { classification: bad ? "LOSER" : "WATCH", reference: null, refKind: null, missing: [],
      reason: bad ? `Gastó ${Math.round(i.totals.spend)} (más del doble del mínimo de ${c.minSpend}) sin ningún resultado.` : `Superó el gasto mínimo pero aún no tiene resultados; conviene observarlo un poco más.` };
  }
  const target = c.targets?.[i.objective];
  const reference = target && target > 0 ? target : bench[i.objective] ?? null;
  const refKind: RefKind = target && target > 0 ? "target" : reference ? "median" : null;
  if (!reference) return { classification: "INSUFFICIENT_DATA", reason: "No hay anuncios comparables con datos suficientes para establecer una referencia.", reference: null, refKind: null, missing: [] };
  const cpr = i.totals.spend / i.totals.results;
  const rel = cpr / reference;
  const refText = refKind === "target" ? `tu costo objetivo (${Math.round(reference)})` : `la mediana de tus anuncios del mismo objetivo (${Math.round(reference)})`;
  const pct = Math.round(Math.abs(rel - 1) * 100);
  const cmp = rel <= 1 ? `${pct}% por debajo de` : `${pct}% por encima de`;
  const reason = `Su costo por resultado (${Math.round(cpr)}) está ${cmp} ${refText}.`;
  const classification: AdClassification = rel <= 0.7 ? "WINNER" : rel <= 0.95 ? "GOOD" : rel <= 1.2 ? "WATCH" : rel <= 1.6 ? "LOW" : "LOSER";
  return { classification, reason, reference, refKind, missing: [] };
}

export const classify = (i: ClassifyInput, bench: Partial<Record<Objective, number>>, c: ClassifyConfig = DEFAULT_CONFIG): AdClassification => classifyDetailed(i, bench, c).classification;
