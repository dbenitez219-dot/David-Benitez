import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { audit } from "@/server/audit/audit";

/** Meta informa que el usuario retiró la autorización: se borran los tokens y se detiene la sincronización. */
export async function handleDeauthorize(metaUserId: string) {
  const accounts = await db.adAccount.findMany({ where: { platform: "META", metaUserId }, select: { id: true, organizationId: true } });
  await db.adAccount.updateMany({ where: { platform: "META", metaUserId }, data: { accessTokenEnc: null, status: "REVOKED", syncEnabled: false, lastError: "Autorización retirada desde Meta" } });
  for (const a of accounts) await audit({ action: "meta.deauthorize", organizationId: a.organizationId, entity: "AdAccount", entityId: a.id });
  return accounts.length;
}

/** Solicitud de eliminación de datos: borra cuentas de Meta de ese usuario y todo lo sincronizado (cascada). */
export async function handleDataDeletion(metaUserId: string) {
  const accounts = await db.adAccount.findMany({ where: { platform: "META", metaUserId }, select: { id: true, organizationId: true } });
  await db.adAccount.deleteMany({ where: { platform: "META", metaUserId } });
  const code = randomBytes(12).toString("hex");
  await db.dataDeletionRequest.create({ data: { code, metaUserId, status: "COMPLETED" } });
  for (const a of accounts) await audit({ action: "meta.data_deletion", organizationId: a.organizationId, metadata: { code } });
  return code;
}
