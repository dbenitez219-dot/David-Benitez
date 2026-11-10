import { redirect } from "next/navigation";
import type { OrgRole } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession } from "@/server/auth/session";

const RANK: Record<OrgRole, number> = { VIEWER: 0, ANALYST: 1, ADMIN: 2, OWNER: 3 };

export const hasRole = (role: OrgRole, min: OrgRole) => RANK[role] >= RANK[min];

export class ForbiddenError extends Error {}

/**
 * Contexto de organización. La pertenencia se verifica SIEMPRE contra la base de datos
 * (nunca se confía en el id de organización que envía el cliente).
 * Toda consulta de negocio debe usar ctx.organizationId.
 */
export async function requireOrg(min: OrgRole = "VIEWER") {
  const session = await getSession();
  if (!session) redirect("/login");
  const memberships = await db.membership.findMany({
    where: { userId: session.userId },
    include: { organization: true },
  });
  const m = memberships.find((x) => x.organizationId === session.activeOrgId) ?? memberships[0];
  if (!m || m.organization.status !== "ACTIVE") redirect("/login");
  if (!hasRole(m.role, min)) throw new ForbiddenError("Permisos insuficientes");
  return { user: session.user, organizationId: m.organizationId, organization: m.organization, role: m.role };
}

export async function requireSuperAdmin() {
  const session = await getSession();
  if (!session || session.user.platformRole !== "SUPERADMIN") redirect("/login");
  return session.user;
}

/** Comprueba que un registro pertenece a la organización (anti-IDOR). */
export async function assertOwned<T extends { organizationId: string } | null>(row: T, organizationId: string): Promise<NonNullable<T>> {
  if (!row || row.organizationId !== organizationId) throw new ForbiddenError("Recurso no encontrado");
  return row as NonNullable<T>;
}
