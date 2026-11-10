import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/crypto";

export const COOKIE = "zentra_session";
const TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 días

export async function createSession(userId: string, activeOrgId: string | null, meta: { ip?: string | null; userAgent?: string | null } = {}) {
  const token = randomToken();
  await db.session.create({
    data: { userId, activeOrgId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + TTL_MS), ip: meta.ip, userAgent: meta.userAgent },
  });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TTL_MS / 1000,
  });
}

export async function getSession() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const s = await db.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!s || s.expiresAt < new Date() || s.user.status !== "ACTIVE") return null;
  return s;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
  jar.delete(COOKIE);
}
