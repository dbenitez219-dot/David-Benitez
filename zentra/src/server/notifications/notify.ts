import { db } from "@/lib/db";
import { defaultMailer } from "./email";

export type NotificationInput = { type: string; title: string; body: string; recommendation?: string; severity?: "important" | "warning" | "info"; dedupeHours?: number };

/**
 * Crea una notificación (qué pasó + qué se recomienda hacer) evitando duplicados sin leer del mismo tipo/título
 * dentro de la ventana. Las importantes se envían además por correo si la organización lo activó.
 */
export async function notifyOnce(organizationId: string, n: NotificationInput) {
  const { dedupeHours = 24, severity = "info", ...data } = n;
  const since = new Date(Date.now() - dedupeHours * 3600 * 1000);
  const dup = await db.notification.findFirst({ where: { organizationId, type: data.type, title: data.title, readAt: null, createdAt: { gte: since } } });
  if (dup) return null;
  const created = await db.notification.create({ data: { organizationId, severity, ...data } });
  if (severity === "important") await emailNotification(organizationId, created.id).catch((e) => console.error("email", (e as Error).message));
  return created;
}

async function emailNotification(organizationId: string, id: string) {
  const settings = await db.automationSettings.findUnique({ where: { organizationId } });
  const mailer = defaultMailer();
  if (!settings?.notifyEmail || !mailer) return;
  const n = await db.notification.findUniqueOrThrow({ where: { id } });
  const members = await db.membership.findMany({ where: { organizationId, role: { in: ["OWNER", "ADMIN"] } }, include: { user: { select: { email: true, status: true } } } });
  const to = members.filter((m) => m.user.status === "ACTIVE").map((m) => m.user.email);
  if (!to.length) return;
  await mailer.send(to, `[ZENTRA] ${n.title}`, `${n.body}\n\n${n.recommendation ? `Qué hacer: ${n.recommendation}\n\n` : ""}Ver en ZENTRA: ${process.env.APP_URL ?? ""}/notifications`);
  await db.notification.update({ where: { id }, data: { emailedAt: new Date() } });
}
