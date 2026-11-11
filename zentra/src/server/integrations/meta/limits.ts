import { getAccess } from "@/server/billing/access";

/** Cuentas publicitarias que la organización puede sincronizar a la vez, según su plan (0 si la suscripción no está activa). */
export async function maxSyncedAccounts(organizationId: string): Promise<number> {
  return (await getAccess(organizationId)).entitlements.maxAdAccounts;
}
