import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export async function audit(e: {
  action: string;
  userId?: string | null;
  organizationId?: string | null;
  entity?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
  ip?: string | null;
}) {
  await db.auditLog.create({ data: { ...e } });
}
