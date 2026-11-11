import { db } from "@/lib/db";

/**
 * Limitador por ventana fija respaldado por PostgreSQL. Devuelve false si se excede.
 * Una sola sentencia atómica (INSERT … ON CONFLICT … RETURNING): sin carreras entre solicitudes simultáneas y
 * contando exactamente cada intento (la primera solicitud de una ventana cuenta 1).
 */
export async function allow(key: string, max: number, windowMs: number): Promise<boolean> {
  const now = new Date(), cutoff = new Date(now.getTime() - windowMs);
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("key", "count", "windowStart") VALUES (${key}, 1, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."windowStart" < ${cutoff} THEN 1 ELSE "RateLimit"."count" + 1 END,
      "windowStart" = CASE WHEN "RateLimit"."windowStart" < ${cutoff} THEN ${now} ELSE "RateLimit"."windowStart" END
    RETURNING "count"`;
  return rows[0].count <= max;
}
