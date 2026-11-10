import { db } from "@/lib/db";

/** Crea una notificación evitando duplicados sin leer del mismo tipo en las últimas 24 h. */
export async function notifyOnce(organizationId: string, n: { type: string; title: string; body: string; recommendation?: string }) {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const dup = await db.notification.findFirst({ where: { organizationId, type: n.type, title: n.title, readAt: null, createdAt: { gte: since } } });
  if (!dup) await db.notification.create({ data: { organizationId, ...n } });
}
