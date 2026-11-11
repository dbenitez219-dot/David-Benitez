import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { encryptSecret, sha256 } from "@/lib/crypto";
import { validateEnv } from "@/lib/env";
import { log, redact, reportError, setAlertFetcher, setLogSink } from "@/lib/monitor";
import { registerUser } from "@/server/auth/service";
import { authenticate } from "@/server/auth/service";
import { createToken, consumeToken, peekToken } from "@/server/auth/tokens";
import { changePassword, requestPasswordReset, resetPassword, sendVerificationEmail, signOutEverywhere, verifyEmail } from "@/server/auth/account";
import { base32, beginTotpSetup, confirmTotpSetup, fromBase32, isMfaFresh, matchTotp, MFA_TTL_MS, stepOf, totpAt, verifySecondFactor } from "@/server/auth/totp";
import { setMailerForTests } from "@/server/notifications/email";
import { jobStatus, runJob } from "@/server/jobs";
import { deleteAccount, exportUserData } from "@/server/privacy/service";
import { ServiceError } from "@/server/errors";
import { buildCsp } from "@/proxy";
import { GET as health } from "@/app/api/health/route";
import { GET as ready } from "@/app/api/ready/route";

const PW = "Correcta12345";
const NEW = "OtraClave98765";
async function mk(email: string, o: { locale?: string } = {}) {
  const r = await registerUser({ name: "Ana", email, password: PW, organizationName: "Org " + email, locale: o.locale });
  if (!r.ok) throw new Error("registro");
  return { userId: r.data.userId, organizationId: r.data.organizationId as string, email };
}
const mailer = () => { const send = vi.fn(async () => {}); setMailerForTests({ send }); return send; };
const sess = (userId: string, h: string) => db.session.create({ data: { userId, tokenHash: h, expiresAt: new Date(Date.now() + 86_400_000) } });

beforeEach(async () => {
  setMailerForTests(undefined); setLogSink(null); setAlertFetcher(null); delete process.env.ERROR_WEBHOOK_URL;
  await db.jobRun.deleteMany(); await db.rateLimit.deleteMany(); await db.auditLog.deleteMany(); await db.organization.deleteMany(); await db.user.deleteMany();
});
afterAll(() => { setMailerForTests(undefined); return db.$disconnect(); });

describe("entorno", () => {
  const good = { DATABASE_URL: "postgresql://x", ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"), APP_URL: "https://app.zentra.example", CRON_SECRET: "c".repeat(40), NODE_ENV: "production" };
  it("en producción exige https, secreto de cron y clave de cifrado válida", () => {
    expect(validateEnv(good).errors).toEqual([]);
    expect(validateEnv({ ...good, APP_URL: "http://x" }).errors.join()).toMatch(/https/);
    expect(validateEnv({ ...good, CRON_SECRET: "corto" }).errors.join()).toMatch(/CRON_SECRET/);
    expect(validateEnv({ ...good, ENCRYPTION_KEY: "abc" }).errors.join()).toMatch(/32 bytes/);
    expect(validateEnv({ ...good, DATABASE_URL: undefined }).errors.join()).toMatch(/DATABASE_URL/);
    expect(validateEnv({ NODE_ENV: "development", DATABASE_URL: "x", ENCRYPTION_KEY: good.ENCRYPTION_KEY }).errors).toEqual([]); // en desarrollo no exige https
  });
  it("avisa de lo que queda desactivado, incluidos los pagos simulados en producción", () => {
    const w = validateEnv({ ...good, ALLOW_SIMULATED_PAYMENTS: "true" }).warnings.join("|");
    for (const rx of [/SIMULADOS/, /RESEND_API_KEY/, /ERROR_WEBHOOK_URL/, /META_APP_ID/, /ANTHROPIC_API_KEY/, /BILLING_WEBHOOK_SECRET/]) expect(w).toMatch(rx);
  });
});

describe("monitoreo", () => {
  it("registra una línea JSON y oculta valores sensibles", () => {
    const lines: string[] = []; setLogSink((l) => lines.push(l));
    log.info("hola", { userId: "u1", accessToken: "SECRETO", nested: { password: "x", ok: 1 }, list: [{ apiKey: "k" }] });
    const e = JSON.parse(lines[0]);
    expect(e).toMatchObject({ level: "info", msg: "hola", userId: "u1", accessToken: "[oculto]", nested: { password: "[oculto]", ok: 1 } });
    expect(JSON.stringify(e)).not.toContain("SECRETO"); expect(e.list[0].apiKey).toBe("[oculto]");
    expect(redact("texto")).toBe("texto");
  });
  it("alerta por webhook, sin repetir el mismo error y sin romper si la alerta falla", async () => {
    setLogSink(() => undefined);
    const f = vi.fn(async () => new Response("ok")); setAlertFetcher(f as unknown as typeof fetch);
    expect((await reportError(new Error("boom"), { route: "/x" })).alerted).toBe(false); // sin ERROR_WEBHOOK_URL
    process.env.ERROR_WEBHOOK_URL = "https://hooks.example/abc";
    expect((await reportError(new Error("boom"), { route: "/x" })).alerted).toBe(true);
    expect((await reportError(new Error("boom"), { route: "/x" })).alerted).toBe(false); // repetido en 5 min
    expect((await reportError(new Error("otro"), { route: "/x" })).alerted).toBe(true);
    const body = JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.text).toContain("boom"); expect(body.text).toContain("/x");
    setAlertFetcher((async () => { throw new Error("red caída"); }) as unknown as typeof fetch);
    process.env.ERROR_WEBHOOK_URL = "https://hooks.example/abc";
    await expect(reportError(new Error("nuevo"), {})).resolves.toEqual({ alerted: false });
  });
  it("las tareas dejan constancia, un fallo se alerta y se detectan las atrasadas", async () => {
    setLogSink(() => undefined);
    expect((await jobStatus()).every((j) => j.stale && j.lastOk === null)).toBe(true); // nunca corrieron
    expect(await runJob("billing", async () => ({ renewed: 2 }))).toEqual({ renewed: 2 });
    const run = await db.jobRun.findFirstOrThrow({ where: { name: "billing" } });
    expect(run).toMatchObject({ ok: true, summary: { renewed: 2 } }); expect(run.finishedAt).not.toBeNull();
    await expect(runJob("sync", async () => { throw new Error("Meta caído"); })).rejects.toThrow("Meta caído");
    expect(await db.jobRun.findFirstOrThrow({ where: { name: "sync" } })).toMatchObject({ ok: false, error: "Meta caído" });
    const st = Object.fromEntries((await jobStatus()).map((j) => [j.name, j]));
    expect(st.billing.stale).toBe(false); expect(st.sync).toMatchObject({ stale: true, lastFailed: true, lastError: "Meta caído" });
    expect((await jobStatus(new Date(Date.now() + 49 * 3600_000))).find((j) => j.name === "billing")?.stale).toBe(true); // pasó más del doble del intervalo
  });
  it("salud y disponibilidad", async () => {
    expect((await health()).status).toBe(200);
    const r = await ready(); expect(r.status).toBe(200); expect(await r.json()).toEqual({ status: "ready" });
  });
});

describe("interruptores globales de emergencia", () => {
  it("AUTOMATION_KILL_SWITCH detiene toda escritura en Meta y deja la acción pendiente", async () => {
    const { executeAction } = await import("@/server/automation/executor");
    const u = await mk("a@x.com");
    const acct = await db.adAccount.create({ data: { organizationId: u.organizationId, platform: "META", externalId: "act_1", name: "C", accessTokenEnc: encryptSecret("T"), canManage: true } });
    const camp = await db.campaign.create({ data: { organizationId: u.organizationId, adAccountId: acct.id, externalId: "c", name: "K", status: "ACTIVE" } });
    const set = await db.adSet.create({ data: { organizationId: u.organizationId, campaignId: camp.id, externalId: "s", name: "S", status: "ACTIVE" } });
    const ad = await db.ad.create({ data: { organizationId: u.organizationId, adSetId: set.id, externalId: "ad1", name: "A", status: "ACTIVE" } });
    await db.automationSettings.update({ where: { organizationId: u.organizationId }, data: { enabled: true, mode: "AUTOMATIC", dryRun: false } });
    const act = await db.automationAction.create({ data: { organizationId: u.organizationId, adId: ad.id, adExternalId: "ad1", type: "PAUSE", reason: "r", idempotencyKey: "k1" } });
    const f = vi.fn(async () => new Response("{}")) as unknown as typeof fetch;
    vi.stubEnv("AUTOMATION_KILL_SWITCH", "true");
    const r = await executeAction(act.id, { trigger: "auto", fetcher: f });
    vi.unstubAllEnvs();
    expect(r).toMatchObject({ status: "PROPOSED" }); expect(r.note).toContain("toda la plataforma"); expect(f).not.toHaveBeenCalled();
    expect((await db.ad.findUniqueOrThrow({ where: { id: ad.id } })).status).toBe("ACTIVE");
  });
  it("BILLING_KILL_SWITCH congela cobros, reintentos y vencimientos (no cobra ni vence a nadie)", async () => {
    const { runBillingCycle, settlePayment, startCheckout } = await import("@/server/billing/service");
    const u = await mk("a@x.com");
    await db.organization.update({ where: { id: u.organizationId }, data: { countryCode: "PY" } });
    const c = await startCheckout({ userId: u.userId, organizationId: u.organizationId, planId: "BUSINESS", consentRecurring: true, returnUrl: "http://x" });
    await settlePayment(c.paymentId, { status: "succeeded", paymentMethodToken: "simtok_x" });
    const end = (await db.subscription.findFirstOrThrow({ where: { organizationId: u.organizationId } })).currentPeriodEnd as Date;
    vi.stubEnv("BILLING_KILL_SWITCH", "true");
    const r = await runBillingCycle(new Date(end.getTime() + 3600_000));
    vi.unstubAllEnvs();
    expect(r).toMatchObject({ renewed: 0, expired: 0, retriesFailed: 0 });
    expect(await db.payment.count({ where: { organizationId: u.organizationId, kind: "RENEWAL" } })).toBe(0);
    expect((await db.subscription.findFirstOrThrow({ where: { organizationId: u.organizationId } })).status).toBe("ACTIVE");
    expect((await runBillingCycle(new Date(end.getTime() + 3600_000))).renewed).toBe(1); // al apagar el interruptor, se reanuda
  });
});

describe("CSP", () => {
  it("scripts solo con nonce, sin frames ajenos ni objetos", () => {
    const csp = buildCsp("abc123", false);
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'"); expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/); expect(csp).not.toContain("unsafe-eval");
    for (const d of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "default-src 'self'", "upgrade-insecure-requests"]) expect(csp).toContain(d);
    expect(buildCsp("n", true)).toContain("'unsafe-eval'"); expect(buildCsp("n", true)).not.toContain("upgrade-insecure-requests");
  });
});

describe("tokens de un solo uso", () => {
  it("se consumen una vez, vencen y el nuevo invalida los anteriores", async () => {
    const u = await mk("a@x.com");
    const t1 = await createToken(u.userId, "RESET", 3600_000);
    expect(await peekToken(t1, "RESET")).toBe(true); expect(await peekToken(t1, "VERIFY")).toBe(false);
    expect(await consumeToken(t1, "RESET")).toBe(u.userId);
    expect(await consumeToken(t1, "RESET")).toBeNull(); // ya usado
    const t2 = await createToken(u.userId, "RESET", 3600_000), t3 = await createToken(u.userId, "RESET", 3600_000);
    expect(await consumeToken(t2, "RESET")).toBeNull(); expect(await consumeToken(t3, "RESET")).toBe(u.userId);
    const old = await createToken(u.userId, "VERIFY", 1000, new Date(Date.now() - 5000));
    expect(await consumeToken(old, "VERIFY")).toBeNull(); expect(await consumeToken("", "VERIFY")).toBeNull(); expect(await consumeToken("x".repeat(500), "VERIFY")).toBeNull();
    const row = await db.authToken.findFirstOrThrow({ where: { userId: u.userId, type: "VERIFY" } });
    expect(row.tokenHash).toBe(sha256(old)); expect(row.tokenHash).not.toContain(old); // solo se guarda el hash
  });
});

describe("recuperación y cambio de contraseña", () => {
  it("responde igual exista o no la cuenta y solo envía el enlace a la cuenta real", async () => {
    const send = mailer(); const u = await mk("a@x.com", { locale: "en" });
    await requestPasswordReset("nadie@x.com"); expect(send).not.toHaveBeenCalled();
    await expect(requestPasswordReset("A@X.com ")).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledTimes(1);
    const [to, subject, body] = send.mock.calls[0] as unknown as [string[], string, string];
    expect(to).toEqual([u.email]); expect(subject).toContain("Reset your ZENTRA password"); expect(body).toMatch(/\/reset-password\?token=[\w-]{20,}/); // en el idioma del usuario
  });
  it("limita las solicitudes (3 por hora por correo)", async () => {
    const send = mailer(); await mk("a@x.com");
    for (let i = 0; i < 6; i++) await requestPasswordReset("a@x.com");
    expect(send).toHaveBeenCalledTimes(3);
  });
  it("restablecer: cambia la clave, cierra TODAS las sesiones, desbloquea y el enlace no se reutiliza", async () => {
    const send = mailer(); const u = await mk("a@x.com");
    await sess(u.userId, "s1"); await sess(u.userId, "s2");
    await db.user.update({ where: { id: u.userId }, data: { failedLogins: 5, lockedUntil: new Date(Date.now() + 3600_000) } });
    await requestPasswordReset("a@x.com");
    const link = ((send.mock.calls[0] as unknown as [string[], string, string])[2].match(/token=([\w-]+)/) as RegExpMatchArray)[1];
    await expect(resetPassword(link, "corta")).rejects.toBeInstanceOf(ServiceError); // contraseña débil
    await resetPassword(link, NEW);
    expect(await db.session.count({ where: { userId: u.userId } })).toBe(0);
    expect((await authenticate("a@x.com", NEW)).ok).toBe(true); expect((await authenticate("a@x.com", PW)).ok).toBe(false);
    await expect(resetPassword(link, "OtraMas1234567")).rejects.toThrow(/no es válido/);
    expect((send.mock.calls.at(-1) as unknown as [string[], string])[1]).toContain("contraseña"); // aviso de que cambió
    expect(await db.auditLog.count({ where: { action: "auth.password_reset" } })).toBe(1);
  });
  it("cambiar contraseña exige la actual y conserva solo la sesión en uso", async () => {
    mailer(); const u = await mk("a@x.com");
    const keep = await sess(u.userId, "keep"); await sess(u.userId, "otra");
    await expect(changePassword({ userId: u.userId, keepSessionId: keep.id }, "incorrecta", NEW)).rejects.toThrow(/actual/);
    await expect(changePassword({ userId: u.userId, keepSessionId: keep.id }, PW, "débil")).rejects.toBeInstanceOf(ServiceError);
    await changePassword({ userId: u.userId, keepSessionId: keep.id }, PW, NEW);
    expect((await db.session.findMany({ where: { userId: u.userId } })).map((s) => s.tokenHash)).toEqual(["keep"]);
    expect((await authenticate("a@x.com", NEW)).ok).toBe(true);
  });
  it("cerrar sesión en otros dispositivos", async () => {
    const u = await mk("a@x.com"); const keep = await sess(u.userId, "keep"); await sess(u.userId, "b"); await sess(u.userId, "c");
    expect(await signOutEverywhere(u.userId, keep.id)).toBe(2); expect(await db.session.count({ where: { userId: u.userId } })).toBe(1);
  });
  it("verificación de correo", async () => {
    const send = mailer(); const u = await mk("a@x.com");
    expect(await sendVerificationEmail(u.userId)).toBe(true);
    const token = ((send.mock.calls[0] as unknown as [string[], string, string])[2].match(/token=([\w-]+)/) as RegExpMatchArray)[1];
    expect(await verifyEmail("falso")).toBe(false); expect(await verifyEmail(token)).toBe(true); expect(await verifyEmail(token)).toBe(false);
    expect((await db.user.findUniqueOrThrow({ where: { id: u.userId } })).emailVerified).not.toBeNull();
    expect(await sendVerificationEmail(u.userId)).toBe(false); // ya verificado
  });
});

describe("verificación en dos pasos (TOTP)", () => {
  it("cumple los vectores de prueba oficiales del RFC 6238 (SHA-1)", () => {
    const secret = base32(Buffer.from("12345678901234567890"));
    expect(secret).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"); expect(fromBase32(secret).toString()).toBe("12345678901234567890");
    for (const [t, code] of [[59, "94287082"], [1111111109, "07081804"], [1111111111, "14050471"], [1234567890, "89005924"], [2000000000, "69279037"]] as const) expect(totpAt(secret, stepOf(t * 1000), 8)).toBe(code);
    expect(totpAt(secret, 1, 6)).toBe("287082");
  });
  it("tolera ±1 intervalo de reloj y rechaza lo demás", () => {
    const s = base32(Buffer.from("12345678901234567890")), now = 1111111109_000;
    const code = totpAt(s, stepOf(now));
    expect(matchTotp(s, code, now)).toBe(stepOf(now)); expect(matchTotp(s, code, now + 30_000)).toBe(stepOf(now)); expect(matchTotp(s, code, now + 90_000)).toBeNull();
    expect(matchTotp(s, "000000", now)).toBeNull(); expect(matchTotp(s, "abc", now)).toBeNull(); expect(matchTotp(s, ` ${code.slice(0, 3)} ${code.slice(3)} `, now)).toBe(stepOf(now));
  });
  it("activación, uso único de cada código, códigos de recuperación y bloqueo por intentos", async () => {
    const u = await mk("adm@x.com"); const now = Date.now();
    const secret = await beginTotpSetup(u.userId);
    const stored = await db.user.findUniqueOrThrow({ where: { id: u.userId } });
    expect(stored.totpSecretEnc).not.toContain(secret); expect(stored.totpEnabledAt).toBeNull(); // cifrado y aún no activo
    expect(await verifySecondFactor(u.userId, "123456", now)).toBe(false); // no activo: no sirve
    await expect(confirmTotpSetup(u.userId, "000000", now)).rejects.toThrow(/no es correcto/);
    const codes = await confirmTotpSetup(u.userId, totpAt(secret, stepOf(now)), now);
    expect(codes).toHaveLength(8); expect(new Set(codes).size).toBe(8);
    const after = await db.user.findUniqueOrThrow({ where: { id: u.userId } });
    expect(after.totpEnabledAt).not.toBeNull(); expect(JSON.stringify(after.recoveryCodes)).not.toContain(codes[0]); expect((after.recoveryCodes as string[])[0]).toBe(sha256(codes[0])); // solo hashes
    await db.rateLimit.deleteMany();
    const next = now + 30_000;
    expect(await verifySecondFactor(u.userId, totpAt(secret, stepOf(now)), now)).toBe(false); // el código usado en la activación no se reutiliza
    expect(await verifySecondFactor(u.userId, totpAt(secret, stepOf(next)), next)).toBe(true);
    expect(await verifySecondFactor(u.userId, totpAt(secret, stepOf(next)), next)).toBe(false); // replay
    await db.rateLimit.deleteMany();
    expect(await verifySecondFactor(u.userId, codes[0], now)).toBe(true); expect(await verifySecondFactor(u.userId, codes[0], now)).toBe(false); // un solo uso
    expect(((await db.user.findUniqueOrThrow({ where: { id: u.userId } })).recoveryCodes as string[]).length).toBe(7);
    await db.rateLimit.deleteMany();
    for (let i = 0; i < 5; i++) expect(await verifySecondFactor(u.userId, "000000", now)).toBe(false);
    await expect(verifySecondFactor(u.userId, totpAt(secret, stepOf(now + 60_000)), now + 60_000)).rejects.toThrow(/Demasiados/);
  });
  it("la verificación caduca a las 12 horas", () => {
    const t = Date.now();
    expect(isMfaFresh(null)).toBe(false); expect(isMfaFresh(new Date(t - 1000), t)).toBe(true); expect(isMfaFresh(new Date(t - MFA_TTL_MS - 1), t)).toBe(false);
  });
});

describe("privacidad: exportar y eliminar", () => {
  async function seed(u: { userId: string; organizationId: string }) {
    const acct = await db.adAccount.create({ data: { organizationId: u.organizationId, platform: "META", externalId: "act_1", name: "Cuenta", accessTokenEnc: encryptSecret("TOKEN_META_SECRETO"), currency: "PYG" } });
    await db.customer.create({ data: { organizationId: u.organizationId, name: "Cliente Uno", phone: "+595981123456" } });
    await db.subscription.updateMany({ where: { organizationId: u.organizationId }, data: { paymentMethodEnc: encryptSecret("simtok_SECRETO") } });
    return acct;
  }
  it("exporta los datos propios sin contraseñas, tokens ni medios de pago", async () => {
    const u = await mk("a@x.com"); await seed(u);
    await db.user.update({ where: { id: u.userId }, data: { totpSecretEnc: encryptSecret("SECRETOTOTP") } });
    const d = await exportUserData(u.userId); const json = JSON.stringify(d);
    expect(d.user.email).toBe("a@x.com"); expect(d.organizations[0].role).toBe("OWNER");
    expect((d.organizations[0] as unknown as { customers: unknown[] }).customers).toHaveLength(1);
    for (const secret of ["TOKEN_META_SECRETO", "simtok_SECRETO", "SECRETOTOTP", "passwordHash", "accessTokenEnc", "paymentMethodEnc", "totpSecretEnc", "$argon2"]) expect(json, secret).not.toContain(secret);
    expect(d.accountActivity.some((a) => a.action === "auth.register")).toBe(true);
  });
  it("un miembro sin rol de administración solo exporta lo básico de la organización; nunca datos de otras", async () => {
    const owner = await mk("o@x.com"); await seed(owner);
    const other = await mk("z@x.com"); await seed({ ...other });
    const viewer = await mk("v@x.com");
    await db.membership.create({ data: { userId: viewer.userId, organizationId: owner.organizationId, role: "VIEWER" } });
    const d = await exportUserData(viewer.userId); const json = JSON.stringify(d);
    const org = d.organizations.find((o) => o.id === owner.organizationId) as Record<string, unknown>;
    expect(org.role).toBe("VIEWER"); expect(org.customers).toBeUndefined(); expect(org.adAccounts).toBeUndefined();
    expect(json).not.toContain("Cliente Uno"); expect(json).not.toContain(other.organizationId);
  });
  it("limita las descargas", async () => {
    const u = await mk("a@x.com");
    for (let i = 0; i < 3; i++) await exportUserData(u.userId);
    await expect(exportUserData(u.userId)).rejects.toBeInstanceOf(ServiceError);
  });
  it("eliminar la cuenta exige contraseña y confirmación, borra todo lo propio, revoca Meta y anonimiza la auditoría", async () => {
    const u = await mk("a@x.com"); const other = await mk("b@x.com"); await seed(u); await seed(other);
    await sess(u.userId, "s1");
    const calls: { url: string; auth: string }[] = [];
    const fetcher = (async (url: string, init: RequestInit) => { calls.push({ url: String(url), auth: (init.headers as Record<string, string>).Authorization }); return new Response("{}"); }) as unknown as typeof fetch;
    await expect(deleteAccount(u.userId, { password: "mala", confirm: "a@x.com" }, { fetcher })).rejects.toThrow(/contraseña/);
    await expect(deleteAccount(u.userId, { password: PW, confirm: "otro@x.com" }, { fetcher })).rejects.toThrow(/correo/);
    expect(await db.user.count({ where: { id: u.userId } })).toBe(1); // nada se borró
    const r = await deleteAccount(u.userId, { password: PW, confirm: " A@X.com " }, { fetcher });
    expect(r.deletedOrganizations).toBe(1);
    expect(await db.user.count({ where: { id: u.userId } })).toBe(0); expect(await db.session.count({ where: { userId: u.userId } })).toBe(0);
    expect(await db.organization.count({ where: { id: u.organizationId } })).toBe(0);
    for (const t of ["adAccount", "customer", "subscription", "payment", "automationSettings"] as const) expect(await (db[t] as unknown as { count: (a: object) => Promise<number> }).count({ where: { organizationId: u.organizationId } }), t).toBe(0);
    expect(calls).toHaveLength(1); expect(calls[0].url).toContain("/me/permissions"); expect(calls[0].auth).toBe("Bearer TOKEN_META_SECRETO");
    expect(await db.auditLog.count({ where: { userId: u.userId } })).toBe(0); // anonimizado
    expect(await db.organization.count({ where: { id: other.organizationId } })).toBe(1); // la otra organización intacta
    expect(await db.customer.count({ where: { organizationId: other.organizationId } })).toBe(1);
  });
  it("si hay otro propietario o solo es miembro, la organización se conserva", async () => {
    const owner = await mk("o@x.com"), co = await mk("c@x.com"), viewer = await mk("v@x.com");
    await db.membership.create({ data: { userId: co.userId, organizationId: owner.organizationId, role: "OWNER" } });
    await db.membership.create({ data: { userId: viewer.userId, organizationId: owner.organizationId, role: "VIEWER" } });
    const nofetch = (async () => { throw new Error("no debe llamarse"); }) as unknown as typeof fetch;
    await deleteAccount(viewer.userId, { password: PW, confirm: "v@x.com" }, { fetcher: nofetch });
    await deleteAccount(owner.userId, { password: PW, confirm: "o@x.com" }, { fetcher: nofetch });
    expect(await db.organization.count({ where: { id: owner.organizationId } })).toBe(1);
    expect(await db.membership.count({ where: { organizationId: owner.organizationId } })).toBe(1);
  });
  it("un propietario de la plataforma no puede eliminarse desde aquí", async () => {
    const a = await mk("adm@x.com"); await db.user.update({ where: { id: a.userId }, data: { platformRole: "SUPERADMIN" } });
    await expect(deleteAccount(a.userId, { password: PW, confirm: "adm@x.com" })).rejects.toThrow(/propietarios de la plataforma/);
  });
});
