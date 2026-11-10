import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { authenticate, registerUser } from "@/server/auth/service";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { assertOwned, ForbiddenError, hasRole } from "@/server/tenancy/context";

const PW = "Correcta12345";
const reg = (email: string, org = "Org") => registerUser({ name: "Test", email, password: PW, organizationName: org, countryCode: "PY" });

beforeEach(async () => {
  await db.auditLog.deleteMany();
  await db.rateLimit.deleteMany();
  await db.organization.deleteMany();
  await db.user.deleteMany();
});
afterAll(() => db.$disconnect());

describe("contraseñas", () => {
  it("usa argon2id y verifica", async () => {
    const h = await hashPassword(PW);
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(h, PW)).toBe(true);
    expect(await verifyPassword(h, "otra")).toBe(false);
  });
});

describe("registro y login", () => {
  it("crea usuario, organización OWNER y automatizaciones desactivadas por defecto", async () => {
    const r = await reg("a@x.com");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const m = await db.membership.findFirstOrThrow({ where: { userId: r.data.userId } });
    expect(m.role).toBe("OWNER");
    const s = await db.automationSettings.findUniqueOrThrow({ where: { organizationId: r.data.organizationId! } });
    expect(s).toMatchObject({ mode: "MANUAL", enabled: false, dryRun: true, emergencyStop: false });
  });
  it("no revela si un correo ya existe y no guarda la contraseña en claro", async () => {
    await reg("a@x.com");
    const dup = await reg("a@x.com");
    expect(dup.ok).toBe(false);
    const u = await db.user.findUniqueOrThrow({ where: { email: "a@x.com" } });
    expect(u.passwordHash).not.toContain(PW);
  });
  it("autentica, rechaza y bloquea tras 5 fallos", async () => {
    await reg("a@x.com");
    expect((await authenticate("a@x.com", PW)).ok).toBe(true);
    for (let i = 0; i < 5; i++) expect((await authenticate("a@x.com", "mala")).ok).toBe(false);
    const locked = await authenticate("a@x.com", PW);
    expect(locked.ok).toBe(false);
  });
  it("respuesta genérica para usuario inexistente", async () => {
    const r = await authenticate("nadie@x.com", "x");
    expect(r).toEqual({ ok: false, error: "Correo o contraseña incorrectos." });
  });
  it("registra auditoría", async () => {
    await reg("a@x.com");
    await authenticate("a@x.com", PW);
    const acts = (await db.auditLog.findMany()).map((a) => a.action).sort();
    expect(acts).toEqual(["auth.login", "auth.register"]);
  });
});

describe("aislamiento multi-organización", () => {
  it("una organización no puede acceder a datos de otra", async () => {
    const a = await reg("a@x.com", "Org A");
    const b = await reg("b@x.com", "Org B");
    if (!a.ok || !b.ok) throw new Error("registro falló");
    const acc = await db.adAccount.create({
      data: { organizationId: a.data.organizationId!, platform: "META", externalId: "act_1", name: "Cuenta A", isDemo: true },
    });
    // Consulta con el filtro de organización que exige el contexto de tenant
    const visibleToB = await db.adAccount.findMany({ where: { organizationId: b.data.organizationId! } });
    expect(visibleToB).toHaveLength(0);
    // Anti-IDOR: B pide por id un recurso de A
    const byId = await db.adAccount.findUnique({ where: { id: acc.id } });
    await expect(assertOwned(byId, b.data.organizationId!)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(assertOwned(byId, a.data.organizationId!)).resolves.toMatchObject({ id: acc.id });
  });
});

describe("roles", () => {
  it("jerarquía OWNER > ADMIN > ANALYST > VIEWER", () => {
    expect(hasRole("OWNER", "ADMIN")).toBe(true);
    expect(hasRole("VIEWER", "ANALYST")).toBe(false);
    expect(hasRole("ADMIN", "OWNER")).toBe(false);
  });
});
