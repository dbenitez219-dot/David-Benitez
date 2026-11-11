import { db } from "@/lib/db";
import { slugify } from "@/lib/validation";
import { hashPassword, verifyPassword } from "./password";
import { audit } from "@/server/audit/audit";
import { allow } from "./rate-limit";
import { ensurePlans, TRIAL_DAYS, type PlanId } from "@/server/billing/plans";

export type AuthResult<T = { userId: string; organizationId: string | null }> =
  | { ok: true; data: T }
  | { ok: false; error: string };

type RegisterInput = { name: string; email: string; password: string; organizationName: string; countryCode?: string; planId?: PlanId; phone?: string; locale?: string; timezone?: string; currency?: string };

export async function registerUser(input: RegisterInput, ip?: string | null): Promise<AuthResult> {
  if (ip && !(await allow(`register:${ip}`, 10, 60 * 60 * 1000))) return { ok: false, error: "Demasiados intentos. Prueba más tarde." };
  const exists = await db.user.findUnique({ where: { email: input.email } });
  if (exists) return { ok: false, error: "No se pudo crear la cuenta con esos datos." }; // no revela si el correo existe

  const passwordHash = await hashPassword(input.password);
  await ensurePlans(); // el catálogo se autorrepara si falta
  const base = slugify(input.organizationName);
  const slug = `${base}-${Math.random().toString(36).slice(2, 7)}`;

  const result = await db.$transaction(async (tx) => {
    const user = await tx.user.create({ data: {
      email: input.email, name: input.name, passwordHash, countryCode: input.countryCode, phone: input.phone,
      ...(input.locale ? { locale: input.locale } : {}), ...(input.timezone ? { timezone: input.timezone } : {}), ...(input.currency ? { currency: input.currency } : {}),
    } });
    const org = await tx.organization.create({
      data: {
        name: input.organizationName,
        slug,
        countryCode: input.countryCode,
        ...(input.currency ? { currency: input.currency } : {}), ...(input.timezone ? { timezone: input.timezone } : {}), // sugeridos según el país; editables en Ajustes regionales
        memberships: { create: { userId: user.id, role: "OWNER" } },
        // Automatizaciones reales: desactivadas por defecto.
        automationSettings: { create: {} },
        // Prueba gratuita de 7 días, sin tarjeta, con el plan elegido (por defecto Business).
        subscriptions: { create: { planId: input.planId ?? "BUSINESS", status: "TRIALING", trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000) } },
      },
    });
    return { userId: user.id, organizationId: org.id };
  });
  await audit({ action: "auth.register", userId: result.userId, organizationId: result.organizationId, ip });
  return { ok: true, data: result };
}

const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;

export async function authenticate(email: string, password: string, ip?: string | null): Promise<AuthResult> {
  const generic = { ok: false as const, error: "Correo o contraseña incorrectos." };
  if (!(await allow(`login:${email}`, 20, 15 * 60 * 1000)) || (ip && !(await allow(`login-ip:${ip}`, 60, 15 * 60 * 1000))))
    return { ok: false, error: "Demasiados intentos. Prueba más tarde." };

  const user = await db.user.findUnique({ where: { email }, include: { memberships: { take: 1, orderBy: { createdAt: "asc" } } } });
  if (!user || user.status !== "ACTIVE") {
    await hashPassword(password); // iguala tiempos de respuesta
    return generic;
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) return { ok: false, error: "Cuenta bloqueada temporalmente. Prueba más tarde." };

  if (!(await verifyPassword(user.passwordHash, password))) {
    const fails = user.failedLogins + 1;
    await db.user.update({ where: { id: user.id }, data: { failedLogins: fails, lockedUntil: fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MS) : null } });
    await audit({ action: "auth.login_failed", userId: user.id, ip });
    return generic;
  }
  await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
  const organizationId = user.memberships[0]?.organizationId ?? null;
  await audit({ action: "auth.login", userId: user.id, organizationId, ip });
  return { ok: true, data: { userId: user.id, organizationId } };
}
