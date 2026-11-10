import { db } from "@/lib/db";
import { DEFAULT_CONFIG, type ClassifyConfig } from "./classify";

// Gasto mínimo sugerido según la moneda (el valor depende de la escala de cada moneda).
const MIN_SPEND: Record<string, number> = { PYG: 50_000, ARS: 15_000, CLP: 10_000, COP: 40_000, UYU: 400, BOB: 70, PEN: 40, BRL: 50, MXN: 200, USD: 10, EUR: 10 };

export type AnalysisConfig = ClassifyConfig & { maxFrequency: number; anomalyFactor: number };

/** Configuración del cliente; si no existe se crea con valores prudentes según su moneda. */
export async function getAnalysisConfig(organizationId: string): Promise<AnalysisConfig> {
  let s = await db.analysisSettings.findUnique({ where: { organizationId } });
  if (!s) {
    const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { currency: true } });
    // Varias consultas simultáneas pueden llegar aquí a la vez: createMany+skipDuplicates es atómico (upsert no lo es).
    await db.analysisSettings.createMany({ data: [{ organizationId, minSpend: MIN_SPEND[org.currency] ?? 10 }], skipDuplicates: true });
    s = await db.analysisSettings.findUniqueOrThrow({ where: { organizationId } });
  }
  const n = (v: unknown) => (v === null || v === undefined ? undefined : Number(v));
  return {
    minSpend: Number(s.minSpend) || DEFAULT_CONFIG.minSpend, minDays: s.minDays, minImpressions: s.minImpressions,
    targets: { MESSAGES: n(s.targetCprMessages), LEADS: n(s.targetCprLeads), SALES: n(s.targetCprSales) },
    maxFrequency: s.maxFrequency, anomalyFactor: s.anomalyFactor,
  };
}
