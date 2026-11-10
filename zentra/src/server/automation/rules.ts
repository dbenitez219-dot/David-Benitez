import { z } from "zod";
import { money } from "@/lib/format";
import type { AdRow } from "@/server/analytics/report";

export const SCOPES = ["ACCOUNT", "CAMPAIGN", "ADSET", "AD"] as const;
export type Scope = (typeof SCOPES)[number];

export const pauseConfig = z.object({
  kind: z.literal("PAUSE"),
  maxCostPerResult: z.number().positive().max(1e12), // costo máximo por resultado
  minSpend: z.number().positive().max(1e12), // gasto mínimo antes de evaluar
  minObservationDays: z.number().int().min(1).max(60), // tiempo mínimo de observación (días con gasto)
  minConversions: z.number().int().min(1).max(1000).default(1), // resultados mínimos para confiar en el costo por resultado
});
export const budgetConfig = z.object({ kind: z.literal("BUDGET_ALERT"), maxDailyBudget: z.number().positive().max(1e12) });
export const ruleConfig = z.discriminatedUnion("kind", [pauseConfig, budgetConfig]);
export type PauseConfig = z.infer<typeof pauseConfig>;
export type RuleConfig = z.infer<typeof ruleConfig>;

export type RuleRow = { id: string; name: string; scope: string; scopeId: string | null; config: unknown; enabled: boolean };
export type ParsedRule = { id: string; name: string; scope: Scope; scopeId: string | null; config: RuleConfig };

export function parseRules(rows: RuleRow[]): ParsedRule[] {
  const out: ParsedRule[] = [];
  for (const r of rows) {
    if (!r.enabled || !SCOPES.includes(r.scope as Scope)) continue;
    const c = ruleConfig.safeParse(r.config);
    if (c.success) out.push({ id: r.id, name: r.name, scope: r.scope as Scope, scopeId: r.scopeId, config: c.data });
  }
  return out;
}

const SPECIFICITY: Record<Scope, number> = { ACCOUNT: 0, CAMPAIGN: 1, ADSET: 2, AD: 3 };

/** La regla más específica gana: anuncio > conjunto > campaña > cuenta. */
export function ruleFor(ad: AdRow, rules: ParsedRule[], kind: "PAUSE" | "BUDGET_ALERT") {
  const hit = rules.filter((r) => r.config.kind === kind && (
    r.scope === "ACCOUNT" || (r.scope === "AD" && r.scopeId === ad.id) || (r.scope === "ADSET" && r.scopeId === ad.adSetId) || (r.scope === "CAMPAIGN" && r.scopeId === ad.campaignId)));
  return hit.sort((a, b) => SPECIFICITY[b.scope] - SPECIFICITY[a.scope])[0] ?? null;
}

export type PauseDecision = { pause: boolean; reason: string };

/**
 * Decide si un anuncio activo debe pausarse según la regla. Evita decisiones precipitadas:
 * exige gasto, días de observación e impresiones mínimas, y no juzga el costo con pocos resultados.
 */
export function decidePause(ad: AdRow, cfg: PauseConfig, currency: string, minImpressions: number): PauseDecision {
  const no = (reason: string) => ({ pause: false, reason });
  if (ad.status !== "ACTIVE") return no("El anuncio no está activo.");
  if (ad.totals.spend < cfg.minSpend) return no("Aún no alcanzó el gasto mínimo de la regla.");
  if (ad.activeDays < cfg.minObservationDays) return no("Aún no cumplió el tiempo mínimo de observación.");
  if (ad.totals.impressions < minImpressions) return no("Aún no tiene impresiones suficientes.");
  const spent = money(ad.totals.spend, currency), days = ad.activeDays;
  if (ad.totals.results >= cfg.minConversions) {
    const cpr = ad.totals.spend / ad.totals.results;
    return cpr > cfg.maxCostPerResult
      ? { pause: true, reason: `Su costo por resultado (${money(cpr, currency)}) supera tu máximo de ${money(cfg.maxCostPerResult, currency)} tras gastar ${spent} en ${days} días con ${ad.totals.results} resultados.` }
      : no("Su costo por resultado está dentro de tu máximo.");
  }
  if (ad.totals.results === 0 && ad.totals.spend >= cfg.minSpend * 2)
    return { pause: true, reason: `Gastó ${spent} (más del doble del gasto mínimo de ${money(cfg.minSpend, currency)}) en ${days} días sin ningún resultado.` };
  return no("Tiene pocos resultados para juzgar el costo; se espera a tener más datos.");
}

/** ¿La hora actual (en la zona de la organización) está dentro de la ventana [from, to)? Admite ventanas que cruzan la medianoche. */
export function inWindow(now: Date, timeZone: string, from: number, to: number): boolean {
  if (from === 0 && to >= 24) return true;
  let h: number;
  try { h = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone }).format(now)); } catch { h = now.getUTCHours(); }
  return from <= to ? h >= from && h < to : h >= from || h < to;
}
