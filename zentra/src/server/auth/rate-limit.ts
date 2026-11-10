import { db } from "@/lib/db";

/** Limitador por ventana fija respaldado por PostgreSQL. Devuelve false si se excede. */
export async function allow(key: string, max: number, windowMs: number): Promise<boolean> {
  const now = new Date();
  const row = await db.rateLimit.upsert({
    where: { key },
    create: { key, count: 1, windowStart: now },
    update: {},
  });
  if (now.getTime() - row.windowStart.getTime() > windowMs) {
    await db.rateLimit.update({ where: { key }, data: { count: 1, windowStart: now } });
    return true;
  }
  const updated = await db.rateLimit.update({ where: { key }, data: { count: { increment: 1 } } });
  return updated.count <= max;
}
