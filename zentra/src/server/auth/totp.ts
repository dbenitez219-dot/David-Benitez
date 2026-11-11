import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { decryptSecret, encryptSecret, sha256 } from "@/lib/crypto";
import { audit } from "@/server/audit/audit";
import { ServiceError } from "@/server/errors";
import { allow } from "./rate-limit";

/** Verificación en dos pasos (TOTP, RFC 6238) con códigos de recuperación. Obligatoria para propietarios de la plataforma. */
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const base32 = (buf: Buffer) => { let bits = 0, v = 0, out = ""; for (const b of buf) { v = (v << 8) | b; bits += 8; while (bits >= 5) { out += B32[(v >>> (bits - 5)) & 31]; bits -= 5; } } if (bits) out += B32[(v << (5 - bits)) & 31]; return out; };
export const fromBase32 = (s: string) => { let bits = 0, v = 0; const out: number[] = []; for (const c of s.replace(/=+$/, "").toUpperCase()) { const i = B32.indexOf(c); if (i < 0) throw new Error("base32 inválido"); v = (v << 5) | i; bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(out); };

export const generateSecret = () => base32(randomBytes(20));
export const stepOf = (ms: number) => Math.floor(ms / 1000 / 30);

export function totpAt(secret: string, step: number, digits = 6): string {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", fromBase32(secret)).update(counter).digest();
  const o = h[h.length - 1] & 15;
  const bin = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(bin % 10 ** digits).padStart(digits, "0");
}

/** Devuelve el intervalo que coincide (tolera ±1 por desfase de reloj) o null. */
export function matchTotp(secret: string, code: string, nowMs = Date.now()): number | null {
  const c = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return null;
  const s = stepOf(nowMs);
  for (const step of [s, s - 1, s + 1]) {
    const exp = Buffer.from(totpAt(secret, step)), got = Buffer.from(c);
    if (timingSafeEqual(exp, got)) return step;
  }
  return null;
}

export const otpauthUri = (email: string, secret: string) => `otpauth://totp/ZENTRA:${encodeURIComponent(email)}?secret=${secret}&issuer=ZENTRA&digits=6&period=30`;

const newRecoveryCode = () => { const b = base32(randomBytes(7)).slice(0, 10).toLowerCase(); return `${b.slice(0, 5)}-${b.slice(5)}`; };

/** Paso 1: genera un secreto pendiente (todavía no activo) y lo guarda cifrado. */
export async function beginTotpSetup(userId: string): Promise<string> {
  const secret = generateSecret();
  await db.user.update({ where: { id: userId }, data: { totpSecretEnc: encryptSecret(secret), totpEnabledAt: null, totpLastStep: null } });
  return secret;
}

/** Paso 2: el usuario demuestra que su app genera códigos. Se activa y se entregan 8 códigos de recuperación (una sola vez). */
export async function confirmTotpSetup(userId: string, code: string, nowMs = Date.now()): Promise<string[]> {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!u.totpSecretEnc || u.totpEnabledAt) throw new ServiceError("No hay una configuración pendiente.");
  const step = matchTotp(decryptSecret(u.totpSecretEnc), code, nowMs);
  if (step === null) throw new ServiceError("El código no es correcto. Revisa la hora de tu teléfono e inténtalo de nuevo.");
  const codes = Array.from({ length: 8 }, newRecoveryCode);
  await db.user.update({ where: { id: userId }, data: { totpEnabledAt: new Date(nowMs), totpLastStep: step, recoveryCodes: codes.map(sha256) } });
  await audit({ action: "auth.totp_enabled", userId });
  return codes;
}

/** Verifica el segundo factor (código TOTP o un código de recuperación de un solo uso). Limita los intentos. */
export async function verifySecondFactor(userId: string, input: string, nowMs = Date.now()): Promise<boolean> {
  if (!(await allow(`totp:${userId}`, 5, 15 * 60_000))) throw new ServiceError("Demasiados intentos. Prueba más tarde.");
  const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!u.totpSecretEnc || !u.totpEnabledAt) return false;
  const code = input.trim();
  const step = matchTotp(decryptSecret(u.totpSecretEnc), code, nowMs);
  if (step !== null) {
    // Un código solo vale una vez: el intervalo debe ser posterior al último usado (cierra la reutilización/"replay").
    const r = await db.user.updateMany({ where: { id: userId, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] }, data: { totpLastStep: step } });
    if (r.count === 1) { await audit({ action: "auth.mfa_ok", userId }); return true; }
    return false;
  }
  const hash = sha256(code.toLowerCase());
  const list = (u.recoveryCodes as string[] | null) ?? [];
  if (list.includes(hash)) {
    const left = list.filter((h) => h !== hash);
    const r = await db.user.updateMany({ where: { id: userId, totpEnabledAt: { not: null } }, data: { recoveryCodes: left } });
    if (r.count === 1) { await audit({ action: "auth.mfa_recovery_used", userId, metadata: { remaining: left.length } }); return true; }
  }
  await audit({ action: "auth.mfa_failed", userId });
  return false;
}

export const MFA_TTL_MS = 12 * 3600_000;
export const isMfaFresh = (verifiedAt: Date | null | undefined, now = Date.now()) => !!verifiedAt && now - verifiedAt.getTime() < MFA_TTL_MS;
