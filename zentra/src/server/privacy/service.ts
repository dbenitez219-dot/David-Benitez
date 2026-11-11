import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { log } from "@/lib/monitor";
import { audit } from "@/server/audit/audit";
import { allow } from "@/server/auth/rate-limit";
import { verifyPassword } from "@/server/auth/password";
import { ServiceError } from "@/server/errors";
import { metaConfig } from "@/server/integrations/meta/config";

const num = (d: unknown) => (d === null || d === undefined ? null : Number(d));

/**
 * Portabilidad (GDPR art. 20): todos los datos de la persona en un JSON. Los datos de cada organización solo los exportan
 * propietarios y administradores. NUNCA incluye contraseñas, tokens, secretos de 2FA ni medios de pago.
 */
export async function exportUserData(userId: string) {
  if (!(await allow(`export:${userId}`, 3, 3600_000))) throw new ServiceError("Demasiadas descargas. Prueba más tarde.");
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, email: true, name: true, countryCode: true, phone: true, locale: true, timezone: true, currency: true, emailVerified: true, platformRole: true, createdAt: true } });
  const memberships = await db.membership.findMany({ where: { userId }, include: { organization: true } });
  const orgs = [];
  for (const m of memberships) {
    const base = { id: m.organization.id, name: m.organization.name, role: m.role, countryCode: m.organization.countryCode, currency: m.organization.currency, timezone: m.organization.timezone, createdAt: m.organization.createdAt };
    if (m.role !== "OWNER" && m.role !== "ADMIN") { orgs.push(base); continue; }
    const organizationId = m.organizationId;
    const [subscriptions, payments, adAccounts, campaigns, ads, insights, customers, leads, sales, notifications, rules, actions, settings, assistant, analysis] = await Promise.all([
      db.subscription.findMany({ where: { organizationId }, select: { planId: true, status: true, trialEndsAt: true, currentPeriodEnd: true, cancelAtPeriodEnd: true, autoRenew: true, consentAt: true, priceMinor: true, currency: true, createdAt: true } }),
      db.payment.findMany({ where: { organizationId }, select: { amountMinor: true, taxMinor: true, currency: true, status: true, kind: true, planId: true, provider: true, isSimulated: true, paidAt: true, createdAt: true } }),
      db.adAccount.findMany({ where: { organizationId }, select: { platform: true, externalId: true, name: true, currency: true, timezone: true, status: true, isDemo: true, syncEnabled: true, canManage: true, lastSyncAt: true, createdAt: true } }),
      db.campaign.findMany({ where: { organizationId }, select: { externalId: true, name: true, objective: true, rawObjective: true, status: true, dailyBudget: true, startTime: true } }),
      db.ad.findMany({ where: { organizationId }, select: { externalId: true, name: true, status: true, startTime: true } }),
      db.adInsightDaily.findMany({ where: { organizationId }, select: { date: true, spend: true, impressions: true, reach: true, clicks: true, messages: true, leads: true, conversions: true, revenue: true, ad: { select: { externalId: true } } }, take: 200_000 }),
      db.customer.findMany({ where: { organizationId }, select: { name: true, phone: true, email: true, campaignExternalId: true, createdAt: true } }),
      db.lead.findMany({ where: { organizationId }, select: { name: true, phone: true, email: true, status: true, source: true, campaignExternalId: true, createdAt: true } }),
      db.sale.findMany({ where: { organizationId }, select: { revenue: true, cost: true, currency: true, campaignExternalId: true, note: true, soldAt: true } }),
      db.notification.findMany({ where: { organizationId }, select: { type: true, severity: true, title: true, body: true, recommendation: true, createdAt: true, readAt: true } }),
      db.automationRule.findMany({ where: { organizationId }, select: { name: true, scope: true, config: true, enabled: true, createdAt: true } }),
      db.automationAction.findMany({ where: { organizationId }, select: { type: true, status: true, source: true, reason: true, note: true, previousState: true, result: true, adExternalId: true, executedAt: true, createdAt: true } }),
      db.automationSettings.findUnique({ where: { organizationId } }),
      db.assistantLog.findMany({ where: { organizationId, userId }, select: { question: true, answer: true, mode: true, createdAt: true } }),
      db.analysisSettings.findUnique({ where: { organizationId } }),
    ]);
    orgs.push({ ...base, subscriptions, payments, adAccounts, campaigns, ads, insights: insights.map((i) => ({ ...i, adExternalId: i.ad.externalId, ad: undefined, spend: num(i.spend), revenue: num(i.revenue) })), customers, leads, sales: sales.map((s) => ({ ...s, revenue: num(s.revenue), cost: num(s.cost) })), notifications, automation: { settings, rules, actions }, assistantQuestions: assistant, analysisCriteria: analysis });
  }
  const activity = await db.auditLog.findMany({ where: { userId }, select: { action: true, createdAt: true, ip: true }, orderBy: { createdAt: "desc" }, take: 1000 });
  await audit({ action: "privacy.export", userId });
  return { exportedAt: new Date().toISOString(), format: "ZENTRA data export v1", user, organizations: orgs, accountActivity: activity };
}

type DeleteOpts = { fetcher?: typeof fetch };

/**
 * Derecho de supresión (GDPR art. 17). Pide contraseña y confirmación escrita. Si la persona es la única propietaria de una organización,
 * se elimina esa organización con TODOS sus datos (también para sus demás miembros); si no, solo sale de ella. Los tokens de Meta se
 * revocan (mejor esfuerzo) y los registros de auditoría se anonimizan. Los propietarios de la plataforma no pueden eliminarse desde aquí.
 */
export async function deleteAccount(userId: string, input: { password: string; confirm: string }, o: DeleteOpts = {}) {
  if (!(await allow(`delete:${userId}`, 5, 3600_000))) throw new ServiceError("Demasiados intentos. Prueba más tarde.");
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.platformRole === "SUPERADMIN") throw new ServiceError("Los propietarios de la plataforma no pueden eliminarse desde aquí; pide a otro propietario que retire tu acceso.");
  if (input.confirm.trim().toLowerCase() !== user.email) throw new ServiceError("Escribe tu correo exacto para confirmar.");
  if (!(await verifyPassword(user.passwordHash, input.password))) throw new ServiceError("La contraseña no es correcta.");

  const memberships = await db.membership.findMany({ where: { userId } });
  const deletedOrgs: string[] = [];
  for (const m of memberships) {
    const otherOwners = await db.membership.count({ where: { organizationId: m.organizationId, role: "OWNER", userId: { not: userId } } });
    if (m.role === "OWNER" && otherOwners === 0) {
      await revokeMeta(m.organizationId, o.fetcher);
      await db.organization.delete({ where: { id: m.organizationId } }); // cascada: cuentas, anuncios, ventas, suscripciones, pagos…
      deletedOrgs.push(m.organizationId);
    }
  }
  await db.auditLog.updateMany({ where: { userId }, data: { userId: null, ip: null } }); // anonimiza el rastro de auditoría
  await db.user.delete({ where: { id: userId } }); // cascada: membresías, sesiones, tokens
  log.info("cuenta eliminada", { organizationsDeleted: deletedOrgs.length });
  await db.auditLog.create({ data: { action: "privacy.account_deleted", metadata: { organizationsDeleted: deletedOrgs.length } } });
  return { deletedOrganizations: deletedOrgs.length };
}

/** Quita el permiso de ZENTRA en Meta (DELETE /me/permissions). Mejor esfuerzo: un fallo no impide la eliminación. */
async function revokeMeta(organizationId: string, fetcher: typeof fetch = fetch) {
  const accounts = await db.adAccount.findMany({ where: { organizationId, platform: "META", isDemo: false, accessTokenEnc: { not: null } }, select: { accessTokenEnc: true } });
  const tokens = new Set(accounts.map((a) => a.accessTokenEnc!));
  for (const enc of tokens) {
    try { await fetcher(`${metaConfig().graphBase}/me/permissions`, { method: "DELETE", headers: { Authorization: `Bearer ${decryptSecret(enc)}` } }); }
    catch (e) { log.warn("no se pudo revocar el permiso de Meta", { err: String(e) }); }
  }
}
