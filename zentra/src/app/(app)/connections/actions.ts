"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit } from "@/server/audit/audit";
import { assertOwned, requireOrg } from "@/server/tenancy/context";
import { maxSyncedAccounts } from "@/server/integrations/meta/limits";
import { syncAdAccount } from "@/server/integrations/meta/sync";

async function own(id: string, organizationId: string) {
  return assertOwned(await db.adAccount.findUnique({ where: { id } }), organizationId);
}

export async function toggleSyncAction(fd: FormData) {
  const ctx = await requireOrg("ADMIN");
  const acct = await own(String(fd.get("id")), ctx.organizationId);
  const enable = fd.get("enable") === "1";
  if (enable) {
    const [active, max] = await Promise.all([
      db.adAccount.count({ where: { organizationId: ctx.organizationId, platform: "META", isDemo: false, syncEnabled: true } }),
      maxSyncedAccounts(ctx.organizationId),
    ]);
    if (active >= max) return; // límite del plan; la interfaz explica el motivo
  }
  await db.adAccount.update({ where: { id: acct.id }, data: { syncEnabled: enable } });
  await audit({ action: enable ? "meta.sync_enable" : "meta.sync_disable", userId: ctx.user.id, organizationId: ctx.organizationId, entity: "AdAccount", entityId: acct.id });
  revalidatePath("/connections");
}

export async function syncNowAction(fd: FormData) {
  const ctx = await requireOrg("ADMIN");
  const acct = await own(String(fd.get("id")), ctx.organizationId);
  await syncAdAccount(acct.id);
  await audit({ action: "meta.sync_manual", userId: ctx.user.id, organizationId: ctx.organizationId, entity: "AdAccount", entityId: acct.id });
  revalidatePath("/", "layout");
}

/** Desconecta: borra el token y detiene la sincronización; los datos ya sincronizados se conservan. */
export async function disconnectAction(fd: FormData) {
  const ctx = await requireOrg("ADMIN");
  const acct = await own(String(fd.get("id")), ctx.organizationId);
  await db.adAccount.update({ where: { id: acct.id }, data: { accessTokenEnc: null, status: "REVOKED", syncEnabled: false, canManage: false } });
  await audit({ action: "meta.disconnect", userId: ctx.user.id, organizationId: ctx.organizationId, entity: "AdAccount", entityId: acct.id });
  revalidatePath("/connections");
}
