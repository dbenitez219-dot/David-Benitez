import { db } from "@/lib/db";
import { ServiceError } from "@/server/errors";
import { LIMITED, PLAN_CATALOG, type Entitlements, type PlanId } from "./plans";

export type AccessState = "none" | "trial" | "active" | "past_due" | "expired";
export type Access = {
  state: AccessState; premium: boolean; planId: PlanId | null; entitlements: Entitlements;
  trialEndsAt: Date | null; periodEnd: Date | null; cancelAtPeriodEnd: boolean; daysLeft: number | null; trialUsed: boolean;
};

export class PlanError extends ServiceError {}
const DAY = 86_400_000;

/**
 * Acceso de una organización según su suscripción, calculado con las fechas (no depende de que el cron haya corrido).
 * Si no hay suscripción vigente, `premium` es false: los datos se conservan pero las funciones premium quedan limitadas.
 */
export async function getAccess(organizationId: string, now = new Date()): Promise<Access> {
  const subs = await db.subscription.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } });
  const trialUsed = subs.some((s) => s.trialEndsAt !== null);
  const s = subs[0];
  const base = { trialEndsAt: s?.trialEndsAt ?? null, periodEnd: s?.currentPeriodEnd ?? null, cancelAtPeriodEnd: s?.cancelAtPeriodEnd ?? false, trialUsed };
  const mk = (state: AccessState, premium: boolean, daysLeft: number | null): Access => ({
    state, premium, planId: s ? (s.planId as PlanId) : null, entitlements: premium && s && PLAN_CATALOG[s.planId as PlanId] ? PLAN_CATALOG[s.planId as PlanId].entitlements : LIMITED, daysLeft, ...base,
  });
  if (!s) return mk("none", false, null);
  const left = (end: Date) => Math.max(0, Math.ceil((end.getTime() - now.getTime()) / DAY));
  switch (s.status) {
    case "TRIALING": return s.trialEndsAt && s.trialEndsAt > now ? mk("trial", true, left(s.trialEndsAt)) : mk("expired", false, 0);
    case "ACTIVE": return s.currentPeriodEnd && s.currentPeriodEnd > now ? mk("active", true, left(s.currentPeriodEnd)) : mk("expired", false, 0);
    case "PAST_DUE": return mk("past_due", true, s.nextRetryAt ? left(s.nextRetryAt) : 0); // periodo de gracia mientras se reintenta el cobro
    default: return mk("expired", false, 0);
  }
}

const INACTIVE = "Tu suscripción no está activa. Tus datos están a salvo; activa tu plan en «Plan y pagos» para usar esta función.";

export async function requirePremium(organizationId: string, now?: Date) {
  const a = await getAccess(organizationId, now);
  if (!a.premium) throw new PlanError(INACTIVE);
  return a;
}

export async function requireFeature(organizationId: string, feature: "commercial" | "advancedReports", now?: Date) {
  const a = await requirePremium(organizationId, now);
  if (!a.entitlements[feature]) throw new PlanError(`Esta función no está incluida en tu plan ${a.planId ? PLAN_CATALOG[a.planId].name : ""}. Cambia de plan en «Plan y pagos».`);
  return a;
}
