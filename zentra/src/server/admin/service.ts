import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/server/audit/audit";
import { ServiceError } from "@/server/errors";

/** Cada operación vuelve a comprobar en la base que quien actúa es propietario de la plataforma (no se confía en el llamador). */
export async function assertSuperAdmin(userId: string) {
  const u = await db.user.findUnique({ where: { id: userId }, select: { platformRole: true, status: true } });
  if (!u || u.platformRole !== "SUPERADMIN" || u.status !== "ACTIVE") throw new ServiceError("Acceso restringido a los propietarios de ZENTRA.");
}

const priceInput = z.object({
  planId: z.enum(["START", "BUSINESS", "AGENCY"]), countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/), currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  amountMinor: z.coerce.number().int().min(1).max(1_000_000_000), taxIncluded: z.boolean(), taxPercent: z.coerce.number().min(0).max(100).nullable(), active: z.boolean(),
});

/** Crea o actualiza el precio de un plan para un país/moneda. Los precios son independientes por mercado (no hay conversión automática). */
export async function setPlanPrice(adminId: string, raw: unknown) {
  await assertSuperAdmin(adminId);
  const i = priceInput.parse(raw);
  const key = { planId_countryCode_currency: { planId: i.planId, countryCode: i.countryCode, currency: i.currency } };
  const row = await db.planPrice.upsert({ where: key, update: { amountMinor: i.amountMinor, taxIncluded: i.taxIncluded, taxPercent: i.taxPercent, active: i.active }, create: { planId: i.planId, countryCode: i.countryCode, currency: i.currency, amountMinor: i.amountMinor, taxIncluded: i.taxIncluded, taxPercent: i.taxPercent, active: i.active } });
  await audit({ action: "admin.price_set", userId: adminId, entity: "PlanPrice", entityId: row.id, metadata: i });
  return row;
}

export async function setOrgStatus(adminId: string, organizationId: string, status: "ACTIVE" | "SUSPENDED") {
  await assertSuperAdmin(adminId);
  const r = await db.organization.updateMany({ where: { id: organizationId }, data: { status } });
  if (r.count === 0) throw new ServiceError("Organización no encontrada.");
  await audit({ action: status === "SUSPENDED" ? "admin.org_suspend" : "admin.org_reactivate", userId: adminId, organizationId });
}

/** Suspender un usuario cierra sus sesiones. No se permite suspender a un propietario de la plataforma. */
export async function setUserStatus(adminId: string, userId: string, status: "ACTIVE" | "SUSPENDED") {
  await assertSuperAdmin(adminId);
  const u = await db.user.findUnique({ where: { id: userId }, select: { platformRole: true } });
  if (!u) throw new ServiceError("Usuario no encontrado.");
  if (u.platformRole === "SUPERADMIN") throw new ServiceError("No se puede suspender a un propietario de la plataforma.");
  await db.user.update({ where: { id: userId }, data: { status } });
  if (status === "SUSPENDED") await db.session.deleteMany({ where: { userId } });
  await audit({ action: status === "SUSPENDED" ? "admin.user_suspend" : "admin.user_reactivate", userId: adminId, entity: "User", entityId: userId });
}

/** Métricas generales (solo agregados: el panel no muestra datos publicitarios ni tokens de los clientes). */
export async function adminOverview(now = new Date()) {
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const [users, orgs, subs, paid, failedActions, erroredAccounts, autoOrgs, recentFailures] = await Promise.all([
    db.user.count(), db.organization.count(),
    db.subscription.groupBy({ by: ["status"], _count: true }),
    db.payment.groupBy({ by: ["currency", "isSimulated"], where: { status: "SUCCEEDED", paidAt: { gte: since } }, _sum: { amountMinor: true }, _count: true }),
    db.automationAction.count({ where: { status: "FAILED", createdAt: { gte: since } } }),
    db.adAccount.findMany({ where: { status: { in: ["ERROR", "EXPIRED"] } }, select: { id: true, name: true, status: true, lastError: true, organizationId: true }, take: 20 }),
    db.automationSettings.findMany({ where: { enabled: true, mode: { not: "MANUAL" } }, select: { organizationId: true, mode: true, dryRun: true, emergencyStop: true, organization: { select: { name: true } } } }),
    db.payment.count({ where: { status: "FAILED", createdAt: { gte: since } } }),
  ]);
  return { users, orgs, subscriptions: Object.fromEntries(subs.map((s) => [s.status, s._count])), revenue30d: paid.map((p) => ({ currency: p.currency, simulated: p.isSimulated, amountMinor: p._sum.amountMinor ?? 0, count: p._count })), failedActions, erroredAccounts, automations: autoOrgs, failedPayments: recentFailures };
}
