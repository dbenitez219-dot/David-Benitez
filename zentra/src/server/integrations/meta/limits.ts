import { db } from "@/lib/db";

/**
 * Cuentas publicitarias que la organización puede sincronizar a la vez.
 * Hasta que exista la suscripción (Fase 6) se aplica el límite del plan Start (1), el más conservador.
 */
export async function maxSyncedAccounts(organizationId: string): Promise<number> {
  const sub = await db.subscription.findFirst({ where: { organizationId, status: { in: ["TRIALING", "ACTIVE"] } }, include: { plan: true }, orderBy: { createdAt: "desc" } });
  return sub?.plan.maxAdAccounts ?? 1;
}
