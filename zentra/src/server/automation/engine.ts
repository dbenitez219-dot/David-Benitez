import { db } from "@/lib/db";
import { money } from "@/lib/format";
import { parseFilters } from "@/lib/filters";
import { buildRecommendations } from "@/server/analytics/recommendations";
import { loadAds, type AdRow } from "@/server/analytics/report";
import { getAnalysisConfig } from "@/server/analytics/settings";
import type { GraphOptions } from "@/server/integrations/meta/graph";
import { notifyOnce } from "@/server/notifications/notify";
import { executeAction } from "./executor";
import { decidePause, parseRules, ruleFor } from "./rules";

export type EvalSummary = { notifications: number; proposed: number; executed: number; simulated: number; blocked: number; expired: number; mode: string; active: boolean; reason?: string };

const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const EXPIRE_MS = 48 * 3600 * 1000;

async function ensureSettings(organizationId: string) {
  await db.automationSettings.createMany({ data: [{ organizationId }], skipDuplicates: true }); // por defecto: MANUAL, apagada, simulación
  return db.automationSettings.findUniqueOrThrow({ where: { organizationId } });
}

/**
 * Evalúa una organización: genera avisos (siempre) y, según el modo, propone o ejecuta acciones.
 *   MANUAL   → solo avisos y recomendaciones; no crea acciones.
 *   ASISTIDA → crea propuestas que esperan la autorización de un administrador.
 *   AUTOMÁTICA → además ejecuta las propuestas por reglas, pasando las compuertas del ejecutor.
 * Idempotente: la clave (anuncio + tipo + día) impide acciones duplicadas aunque se evalúe varias veces o en paralelo.
 */
export async function evaluateOrganization(organizationId: string, o: { now?: Date } & GraphOptions = {}): Promise<EvalSummary> {
  const now = o.now ?? new Date();
  const settings = await ensureSettings(organizationId);
  const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { currency: true } });
  const cur = org.currency;
  const [cfg, ruleRows] = await Promise.all([getAnalysisConfig(organizationId), db.automationRule.findMany({ where: { organizationId } })]);
  const ads = await loadAds(organizationId, parseFilters({ range: "30" }, now));
  const rules = parseRules(ruleRows);
  const sum: EvalSummary = { notifications: 0, proposed: 0, executed: 0, simulated: 0, blocked: 0, expired: 0, mode: settings.mode, active: false };
  const note = async (n: Parameters<typeof notifyOnce>[1]) => { if (await notifyOnce(organizationId, n)) sum.notifications++; };

  // ── Avisos (siempre, también en modo manual) ──
  for (const r of buildRecommendations(ads, cfg, cur)) {
    if (r.kind === "ANOMALY") await note({ type: "anomaly", severity: "important", title: r.title, body: r.explanation, recommendation: r.suggestedAction });
    else if (r.kind === "SCALE_CANDIDATE") await note({ type: "winner", severity: "info", dedupeHours: 24 * 7, title: r.title, body: r.explanation, recommendation: r.suggestedAction });
    else if (r.kind === "PAUSE_CANDIDATE") await note({ type: "low_performance", severity: "warning", dedupeHours: 24 * 3, title: r.title, body: r.explanation, recommendation: r.suggestedAction });
  }
  const todayStr = dayKey(now);
  const spendToday = (list: AdRow[]) => list.reduce((t, a) => t + (a.series.find((p) => p.date === todayStr)?.spend ?? 0), 0);
  for (const rule of rules.filter((r) => r.config.kind === "BUDGET_ALERT")) {
    const scoped = ads.filter((a) => ruleFor(a, [rule], "BUDGET_ALERT"));
    const spent = spendToday(scoped), max = rule.config.kind === "BUDGET_ALERT" ? rule.config.maxDailyBudget : 0;
    if (max && spent > max) await note({ type: "budget", severity: "important", title: `Presupuesto diario superado: ${rule.name}`, body: `Hoy se gastaron ${money(spent, cur)}, más que tu máximo de ${money(max, cur)}.`, recommendation: "Revisa los presupuestos de las campañas. ZENTRA no los cambia automáticamente." });
  }

  // ── Acciones ──
  if (!settings.enabled || settings.mode === "MANUAL" || settings.emergencyStop) {
    sum.reason = settings.emergencyStop ? "Botón de emergencia activado" : !settings.enabled ? "Automatizaciones desactivadas" : "Modo manual: solo recomendaciones";
    return sum;
  }
  sum.active = true;

  // Propuestas viejas sin decidir caducan (los datos que las motivaron ya no son frescos).
  const expired = await db.automationAction.updateMany({ where: { organizationId, status: "PROPOSED", source: "RULE", createdAt: { lt: new Date(now.getTime() - EXPIRE_MS) } }, data: { status: "REJECTED", note: "Caducó sin ser aprobada." } });
  sum.expired = expired.count;

  const key = (ad: AdRow) => `PAUSE:${ad.id}:${todayStr}`;
  const fresh: { ad: AdRow; reason: string; ruleId: string }[] = [];
  for (const ad of ads) {
    const rule = ruleFor(ad, rules, "PAUSE");
    if (!rule || rule.config.kind !== "PAUSE") continue;
    const d = decidePause(ad, rule.config, cur, cfg.minImpressions);
    if (d.pause) fresh.push({ ad, reason: d.reason, ruleId: rule.id });
  }
  if (fresh.length) {
    // No se re-propone un anuncio que ya tiene una acción PAUSE pendiente.
    const pending = new Set((await db.automationAction.findMany({ where: { organizationId, type: "PAUSE", status: { in: ["PROPOSED", "APPROVED", "EXECUTING"] } }, select: { adId: true } })).map((a) => a.adId));
    const todo = fresh.filter((f) => !pending.has(f.ad.id));
    const created = await db.automationAction.createMany({
      skipDuplicates: true, // clave única (organización + idempotencyKey)
      data: todo.map((f) => ({ organizationId, adId: f.ad.id, adExternalId: f.ad.externalId, type: "PAUSE", status: "PROPOSED" as const, source: "RULE", ruleId: f.ruleId, reason: f.reason, previousState: { status: f.ad.status }, idempotencyKey: key(f.ad) })),
    });
    sum.proposed = created.count;
    if (created.count) await note({ type: "approval", severity: "important", dedupeHours: 6, title: `${created.count} acción(es) esperan tu aprobación`, body: `ZENTRA propone pausar ${created.count} anuncio(s) según tus reglas.`,
      recommendation: settings.mode === "ASSISTED" ? "Entra a Automatizaciones, revisa el motivo de cada una y aprueba o rechaza." : "Se ejecutarán según tu modo automático si pasan todas las verificaciones." });
  }

  if (settings.mode === "AUTOMATIC") {
    const queue = await db.automationAction.findMany({ where: { organizationId, status: "PROPOSED", source: "RULE" }, orderBy: { createdAt: "asc" } });
    for (const a of queue) {
      const r = await executeAction(a.id, { trigger: "auto", now, fetcher: o.fetcher, sleep: o.sleep, maxRetries: o.maxRetries, baseDelayMs: o.baseDelayMs });
      if (r.status === "EXECUTED") sum.executed++; else if (r.status === "SIMULATED") sum.simulated++; else if (r.status === "PROPOSED") sum.blocked++;
    }
  }
  return sum;
}


/** Evalúa todas las organizaciones con cuentas publicitarias (lo invoca el cron). */
export async function evaluateAll(o: GraphOptions = {}) {
  const orgs = await db.organization.findMany({ where: { status: "ACTIVE", adAccounts: { some: {} } }, select: { id: true } });
  const out = [];
  for (const org of orgs) {
    try { out.push({ organizationId: org.id, ...(await evaluateOrganization(org.id, o)) }); }
    catch (e) { console.error("evaluate", org.id, (e as Error).message); }
  }
  return out;
}
