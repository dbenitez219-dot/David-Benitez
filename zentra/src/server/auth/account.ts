import { db } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { makeT, resolveLocale } from "@/lib/i18n";
import { log } from "@/lib/monitor";
import { passwordSchema } from "@/lib/validation";
import { audit } from "@/server/audit/audit";
import { ServiceError } from "@/server/errors";
import { defaultMailer } from "@/server/notifications/email";
import { allow } from "./rate-limit";
import { hashPassword, verifyPassword } from "./password";
import { consumeToken, createToken } from "./tokens";

const HOUR = 3600_000;
const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

async function send(user: { email: string; locale: string }, kind: "reset" | "verify" | "changed", link?: string) {
  const t = makeT(resolveLocale({ userLocale: user.locale }));
  const mailer = defaultMailer();
  const body = t(`mail.${kind}.body`, link ? { link } : undefined);
  if (!mailer) {
    // Sin proveedor de correo no se puede enviar. En desarrollo se muestra el enlace en el registro para poder probar; en producción NO.
    if (process.env.NODE_ENV !== "production") log.info(`[dev] correo "${kind}" para ${user.email}: ${link ?? body}`);
    else log.warn(`No se pudo enviar el correo "${kind}": falta configurar RESEND_API_KEY/MAIL_FROM`);
    return false;
  }
  await mailer.send([user.email], t(`mail.${kind}.subject`), body);
  return true;
}

/**
 * Solicita restablecer la contraseña. La respuesta es SIEMPRE la misma exista o no la cuenta (no revela qué correos están registrados),
 * y está limitada por correo y por IP.
 */
export async function requestPasswordReset(email: string, ip?: string | null): Promise<void> {
  const e = email.trim().toLowerCase().slice(0, 254);
  if (!(await allow(`reset:${e}`, 3, HOUR)) || (ip && !(await allow(`reset-ip:${ip}`, 10, HOUR)))) return;
  const user = await db.user.findUnique({ where: { email: e } });
  if (!user || user.status !== "ACTIVE") return;
  const token = await createToken(user.id, "RESET", HOUR);
  await audit({ action: "auth.reset_requested", userId: user.id, ip });
  await send(user, "reset", `${appUrl()}/reset-password?token=${token}`).catch((err) => log.error("correo de restablecimiento", { err: String(err) }));
}

/** Establece una contraseña nueva con el token del correo; cierra TODAS las sesiones abiertas y desbloquea la cuenta. */
export async function resetPassword(token: string, newPassword: string, ip?: string | null): Promise<void> {
  const parsed = passwordSchema.safeParse(newPassword);
  if (!parsed.success) throw new ServiceError(parsed.error.issues[0]?.message ?? "Contraseña inválida.");
  const userId = await consumeToken(token, "RESET");
  if (!userId) throw new ServiceError("El enlace no es válido o ya venció. Solicita uno nuevo.");
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(newPassword), failedLogins: 0, lockedUntil: null } });
  await db.session.deleteMany({ where: { userId } });
  await audit({ action: "auth.password_reset", userId, ip });
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  await send(user, "changed").catch(() => undefined);
}

/** Cambio de contraseña con la actual; cierra las demás sesiones (la actual se conserva). */
export async function changePassword(p: { userId: string; keepSessionId?: string }, current: string, next: string): Promise<void> {
  if (!(await allow(`chgpw:${p.userId}`, 5, 15 * 60_000))) throw new ServiceError("Demasiados intentos. Prueba más tarde.");
  const parsed = passwordSchema.safeParse(next);
  if (!parsed.success) throw new ServiceError(parsed.error.issues[0]?.message ?? "Contraseña inválida.");
  const user = await db.user.findUniqueOrThrow({ where: { id: p.userId } });
  if (!(await verifyPassword(user.passwordHash, current))) throw new ServiceError("La contraseña actual no es correcta.");
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next) } });
  await db.session.deleteMany({ where: { userId: user.id, ...(p.keepSessionId ? { id: { not: p.keepSessionId } } : {}) } });
  await audit({ action: "auth.password_changed", userId: user.id });
  await send(user, "changed").catch(() => undefined);
}

/** Cierra todas las sesiones del usuario (menos la actual si se indica). */
export async function signOutEverywhere(userId: string, keepSessionId?: string) {
  const r = await db.session.deleteMany({ where: { userId, ...(keepSessionId ? { id: { not: keepSessionId } } : {}) } });
  await audit({ action: "auth.signout_everywhere", userId, metadata: { sessions: r.count } });
  return r.count;
}

export async function sendVerificationEmail(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.emailVerified) return false;
  if (!(await allow(`verify:${userId}`, 3, HOUR))) return false;
  const token = await createToken(userId, "VERIFY", 24 * HOUR);
  return send(user, "verify", `${appUrl()}/verify-email?token=${token}`).catch(() => false);
}

export async function verifyEmail(token: string): Promise<boolean> {
  const userId = await consumeToken(token, "VERIFY");
  if (!userId) return false;
  await db.user.update({ where: { id: userId }, data: { emailVerified: new Date() } });
  await audit({ action: "auth.email_verified", userId });
  return true;
}

export { sha256 };
