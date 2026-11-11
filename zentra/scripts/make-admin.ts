// Promueve a un usuario EXISTENTE a propietario de la plataforma (acceso al panel /admin).
// Uso: npm run admin:promote -- correo@ejemplo.com   (se ejecuta en el servidor; no hay forma de hacerlo desde la web)
import { PrismaClient } from "@prisma/client";

async function main() {
  const email = (process.argv[2] ?? "").trim().toLowerCase();
  if (!email) throw new Error("Indica el correo del usuario: npm run admin:promote -- correo@ejemplo.com");
  const db = new PrismaClient();
  const u = await db.user.findUnique({ where: { email } });
  if (!u) throw new Error("No existe un usuario con ese correo. Debe registrarse primero.");
  await db.user.update({ where: { id: u.id }, data: { platformRole: "SUPERADMIN" } });
  await db.auditLog.create({ data: { action: "admin.promote", entity: "User", entityId: u.id, metadata: { via: "script" } } });
  console.log(`✔ ${email} ahora es propietario de la plataforma.`);
  await db.$disconnect();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
