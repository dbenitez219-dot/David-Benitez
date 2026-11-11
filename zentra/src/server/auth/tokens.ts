import { db } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/crypto";

export type TokenType = "RESET" | "VERIFY";

/** Crea un token de un solo uso (se guarda solo su hash; el valor en claro viaja únicamente en el enlace del correo). */
export async function createToken(userId: string, type: TokenType, ttlMs: number, now = new Date()): Promise<string> {
  await db.authToken.updateMany({ where: { userId, type, usedAt: null }, data: { usedAt: now } }); // los anteriores quedan invalidados
  const raw = randomToken();
  await db.authToken.create({ data: { userId, type, tokenHash: sha256(raw), expiresAt: new Date(now.getTime() + ttlMs) } });
  return raw;
}

/** Consume el token de forma atómica: solo una persona/solicitud puede usarlo, y solo antes de vencer. */
export async function consumeToken(raw: string, type: TokenType, now = new Date()): Promise<string | null> {
  if (!raw || raw.length > 200) return null;
  const hash = sha256(raw);
  const r = await db.authToken.updateMany({ where: { tokenHash: hash, type, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
  if (r.count !== 1) return null;
  return (await db.authToken.findUniqueOrThrow({ where: { tokenHash: hash } })).userId;
}

/** Comprueba (sin consumir) que el token es válido: para mostrar el formulario correcto. */
export async function peekToken(raw: string, type: TokenType, now = new Date()): Promise<boolean> {
  if (!raw || raw.length > 200) return false;
  return (await db.authToken.count({ where: { tokenHash: sha256(raw), type, usedAt: null, expiresAt: { gt: now } } })) === 1;
}
