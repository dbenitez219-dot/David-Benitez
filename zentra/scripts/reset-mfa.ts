// Desactiva la verificación en dos pasos de un propietario que perdió su teléfono Y sus códigos de recuperación.
// Uso (solo en el servidor): npm run admin:reset-mfa -- correo@ejemplo.com. Al volver a entrar deberá configurarla de nuevo.
import { PrismaClient } from "@prisma/client";

async function main() {
  const email = (process.argv[2] ?? "").trim().toLowerCase();
  if (!email) throw new Error("Indica el correo: npm run admin:reset-mfa -- correo@ejemplo.com");
  const db = new PrismaClient();
  const u = await db.user.findUnique({ where: { email } });
  if (!u) throw new Error("No existe un usuario con ese correo.");
  await db.user.update({ where: { id: u.id }, data: { totpSecretEnc: null, totpEnabledAt: null, totpLastStep: null, recoveryCodes: undefined } });
  await db.session.updateMany({ where: { userId: u.id }, data: { mfaVerifiedAt: null } });
  await db.auditLog.create({ data: { action: "admin.mfa_reset", entity: "User", entityId: u.id, metadata: { via: "script" } } });
  console.log(`✔ Verificación en dos pasos reiniciada para ${email}.`);
  await db.$disconnect();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
