import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { registerUser } from "@/server/auth/service";
import { getAccess, PlanError, requirePremium } from "@/server/billing/access";
import { addMonths, ensurePlans, PLAN_CATALOG, priceFor, taxBreakdown } from "@/server/billing/plans";
import { cancelSubscription, handleWebhook, resumeSubscription, runBillingCycle, settlePayment, startCheckout, startTrial } from "@/server/billing/service";
import { providerFor } from "@/server/billing/providers";
import { setSimulatedChargesFail, signSimulatedWebhook } from "@/server/billing/providers/simulated";
import { createRule } from "@/server/automation/service";
import { saveSettings, ServiceError } from "@/server/automation/service";
import { evaluateOrganization } from "@/server/automation/engine";
import { syncAdAccount } from "@/server/integrations/meta/sync";
import { askAssistant, type LLM } from "@/server/ai/assistant";
import { createSale } from "@/server/commercial/service";
import { adminOverview, assertSuperAdmin, setOrgStatus, setPlanPrice, setUserStatus } from "@/server/admin/service";

const DAY = 86_400_000;
const PW = "Correcta12345";
async function mk(email: string, o: { planId?: "START" | "BUSINESS" | "AGENCY"; country?: string } = {}) {
  const r = await registerUser({ name: "Ana", email, password: PW, organizationName: "Org", countryCode: o.country ?? "PY", planId: o.planId });
  if (!r.ok) throw new Error("registro");
  return { organizationId: r.data.organizationId as string, userId: r.data.userId, returnUrl: "http://localhost:3000" };
}
type E = Awaited<ReturnType<typeof mk>>;
const sub = (organizationId: string) => db.subscription.findFirstOrThrow({ where: { organizationId }, orderBy: { createdAt: "desc" } });
const notes = (organizationId: string) => db.notification.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } });

/** Paga el plan de punta a punta con el proveedor simulado. */
async function pay(e: E, planId: "START" | "BUSINESS" | "AGENCY", o: { consent?: boolean; token?: string; now?: Date } = {}) {
  const c = await startCheckout({ ...e, planId, consentRecurring: !!o.consent }, o.now);
  await settlePayment(c.paymentId, { status: "succeeded", paymentMethodToken: o.consent ? (o.token ?? "simtok_abc") : undefined }, o.now);
  return c;
}

beforeEach(async () => {
  setSimulatedChargesFail(false); vi.unstubAllEnvs();
  await db.webhookEvent.deleteMany(); await db.rateLimit.deleteMany(); await db.auditLog.deleteMany(); await db.organization.deleteMany(); await db.user.deleteMany();
  await db.planPrice.deleteMany(); await ensurePlans();
});
afterAll(() => db.$disconnect());

describe("planes, precios e impuestos", () => {
  it("el catálogo trae los 3 planes con los precios iniciales de Paraguay", async () => {
    const prices = await db.planPrice.findMany({ where: { countryCode: "PY" }, orderBy: { amountMinor: "asc" } });
    expect(prices.map((p) => [p.planId, p.currency, p.amountMinor])).toEqual([["START", "PYG", 99_999], ["BUSINESS", "PYG", 199_999], ["AGENCY", "PYG", 399_999]]);
    expect([1, 3, 10]).toEqual([PLAN_CATALOG.START, PLAN_CATALOG.BUSINESS, PLAN_CATALOG.AGENCY].map((p) => p.entitlements.maxAdAccounts));
  });
  it("no hay conversión automática: sin precio para el país, el plan no se puede pagar allí", async () => {
    expect(await priceFor("START", "AR")).toBeNull(); expect(await priceFor("START", null)).toBeNull();
    const e = await mk("a@x.com", { country: "AR" });
    await expect(startCheckout({ ...e, planId: "START", consentRecurring: false })).rejects.toThrow(/precio definido para tu país/);
  });
  it("desglose de impuestos (incluido y no incluido) y suma de meses", () => {
    expect(taxBreakdown(110_000, true, 10)).toEqual({ net: 100_000, tax: 10_000, total: 110_000 });
    expect(taxBreakdown(100_000, false, 10)).toEqual({ net: 100_000, tax: 10_000, total: 110_000 });
    expect(taxBreakdown(100_000, true, null)).toEqual({ net: 100_000, tax: 0, total: 100_000 });
    expect(addMonths(new Date("2026-01-31T00:00:00Z"), 1).toISOString().slice(0, 10)).toBe("2026-02-28");
    expect(addMonths(new Date("2026-11-11T00:00:00Z"), 1).toISOString().slice(0, 10)).toBe("2026-12-11");
  });
});

describe("registro y prueba gratuita", () => {
  it("el registro inicia 7 días de prueba con el plan elegido, sin tarjeta ni pagos", async () => {
    const e = await mk("a@x.com", { planId: "AGENCY" });
    const s = await sub(e.organizationId);
    expect(s).toMatchObject({ planId: "AGENCY", status: "TRIALING", autoRenew: false, paymentMethodEnc: null });
    expect(Math.round((s.trialEndsAt!.getTime() - Date.now()) / DAY)).toBe(7);
    expect(await db.payment.count({ where: { organizationId: e.organizationId } })).toBe(0);
    const a = await getAccess(e.organizationId);
    expect(a).toMatchObject({ state: "trial", premium: true, planId: "AGENCY", daysLeft: 7 });
  });
  it("una sola prueba por organización", async () => {
    const e = await mk("a@x.com");
    await expect(startTrial({ ...e, planId: "START" })).rejects.toThrow(/ya usó la prueba/);
  });
  it("al vencer la prueba el acceso premium se limita (sin depender del cron)", async () => {
    const e = await mk("a@x.com");
    const a = await getAccess(e.organizationId, new Date(Date.now() + 8 * DAY));
    expect(a).toMatchObject({ state: "expired", premium: false, trialUsed: true }); expect(a.entitlements.maxAdAccounts).toBe(0);
    await expect(requirePremium(e.organizationId, new Date(Date.now() + 8 * DAY))).rejects.toBeInstanceOf(PlanError);
    await db.subscription.deleteMany({ where: { organizationId: e.organizationId } });
    expect((await getAccess(e.organizationId)).state).toBe("none");
  });
  it("avisos 3 días y 24 horas antes, y vencimiento, sin duplicar", async () => {
    const e = await mk("a@x.com"); const s = await sub(e.organizationId);
    const set = (ms: number) => db.subscription.update({ where: { id: s.id }, data: { trialEndsAt: new Date(Date.now() + ms) } });
    await set(2.5 * DAY); await runBillingCycle(); await runBillingCycle();
    expect((await notes(e.organizationId)).map((n) => n.title)).toEqual(["Tu prueba gratuita termina en 3 días"]);
    await set(20 * 3600_000); await runBillingCycle(); await runBillingCycle();
    expect((await notes(e.organizationId)).map((n) => n.title)).toContain("Tu prueba gratuita termina en menos de 24 horas");
    expect((await notes(e.organizationId)).filter((n) => n.title.includes("24 horas"))).toHaveLength(1);
    expect((await notes(e.organizationId)).every((n) => n.recommendation)).toBe(true);
    await set(-1000); const r = await runBillingCycle();
    expect(r.trialsExpired).toBe(1); expect((await sub(e.organizationId)).status).toBe("EXPIRED");
    expect((await notes(e.organizationId)).some((n) => n.title === "Tu prueba gratuita terminó")).toBe(true);
  });
});

describe("pagos", () => {
  it("el checkout NO cobra ni activa nada hasta que el proveedor confirma", async () => {
    const e = await mk("a@x.com");
    const c = await startCheckout({ ...e, planId: "BUSINESS", consentRecurring: false });
    expect(c.url).toContain("/billing/simulated?ref=sim_");
    const p = await db.payment.findUniqueOrThrow({ where: { id: c.paymentId } });
    expect(p).toMatchObject({ status: "PENDING", amountMinor: 199_999, currency: "PYG", provider: "simulated", isSimulated: true, kind: "INITIAL", planId: "BUSINESS" });
    expect((await sub(e.organizationId)).status).toBe("TRIALING");
  });
  it("pago exitoso: activa el plan un mes, registra historial y es idempotente", async () => {
    const e = await mk("a@x.com", { planId: "START" });
    const now = new Date("2026-11-11T12:00:00Z");
    const c = await startCheckout({ ...e, planId: "BUSINESS", consentRecurring: false }, now);
    expect((await settlePayment(c.paymentId, { status: "succeeded" }, now)).applied).toBe(true);
    expect((await settlePayment(c.paymentId, { status: "succeeded" }, now)).applied).toBe(false);
    expect((await settlePayment(c.paymentId, { status: "failed" }, now)).applied).toBe(false);
    const s = await sub(e.organizationId);
    expect(s).toMatchObject({ status: "ACTIVE", planId: "BUSINESS", autoRenew: false, paymentMethodEnc: null, priceMinor: 199_999, currency: "PYG" });
    expect(s.currentPeriodEnd!.toISOString()).toBe("2026-12-11T12:00:00.000Z");
    const p = await db.payment.findUniqueOrThrow({ where: { id: c.paymentId } });
    expect(p).toMatchObject({ status: "SUCCEEDED" }); expect(p.paidAt).not.toBeNull();
    expect((await db.auditLog.findMany({ where: { action: "billing.payment_succeeded" } }))).toHaveLength(1);
    expect((await getAccess(e.organizationId, now)).state).toBe("active");
  });
  it("pago fallido: no activa nada y explica qué hacer", async () => {
    const e = await mk("a@x.com");
    const c = await startCheckout({ ...e, planId: "START", consentRecurring: false });
    await settlePayment(c.paymentId, { status: "failed", reason: "Tarjeta rechazada" });
    expect(await db.payment.findUniqueOrThrow({ where: { id: c.paymentId } })).toMatchObject({ status: "FAILED", failureReason: "Tarjeta rechazada" });
    expect((await sub(e.organizationId)).status).toBe("TRIALING");
    expect((await notes(e.organizationId))[0].recommendation).toContain("otro medio de pago");
  });
  it("el cobro automático solo existe con autorización explícita y guarda un token cifrado (nunca datos de tarjeta)", async () => {
    const e = await mk("a@x.com");
    await pay(e, "BUSINESS", { consent: true, token: "simtok_SECRETO" });
    const s = await sub(e.organizationId);
    expect(s.autoRenew).toBe(true); expect(s.consentAt).not.toBeNull();
    expect(s.paymentMethodEnc).not.toContain("SECRETO"); expect(decryptSecret(s.paymentMethodEnc!)).toBe("simtok_SECRETO");
    const e2 = await mk("b@x.com");
    await pay(e2, "BUSINESS", { consent: false, token: "simtok_x" });
    expect(await sub(e2.organizationId)).toMatchObject({ autoRenew: false, consentAt: null, paymentMethodEnc: null });
  });
  it("el proveedor simulado queda deshabilitado en producción salvo autorización expresa", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(providerFor("PY", "PYG")).toBeNull();
    const e = await mk("a@x.com");
    await expect(startCheckout({ ...e, planId: "START", consentRecurring: false })).rejects.toThrow(/todavía no están habilitados/);
    vi.stubEnv("ALLOW_SIMULATED_PAYMENTS", "true");
    expect(providerFor("PY", "PYG")?.id).toBe("simulated");
  });
  it("el impuesto del mercado se calcula y registra", async () => {
    const admin = await mk("adm@x.com"); await db.user.update({ where: { id: admin.userId }, data: { platformRole: "SUPERADMIN" } });
    await setPlanPrice(admin.userId, { planId: "START", countryCode: "PY", currency: "PYG", amountMinor: 110_000, taxIncluded: true, taxPercent: 10, active: true });
    const e = await mk("a@x.com"); const c = await startCheckout({ ...e, planId: "START", consentRecurring: false });
    expect(await db.payment.findUniqueOrThrow({ where: { id: c.paymentId } })).toMatchObject({ amountMinor: 110_000, taxMinor: 10_000 });
  });
  it("cambio de plan y renovación manual", async () => {
    const e = await mk("a@x.com"); const t0 = new Date("2026-11-11T00:00:00Z");
    await pay(e, "START", { now: t0 });
    const manual = await startCheckout({ ...e, planId: "START", consentRecurring: false }, new Date("2026-11-20T00:00:00Z"));
    expect((await db.payment.findUniqueOrThrow({ where: { id: manual.paymentId } })).kind).toBe("MANUAL_RENEWAL");
    await settlePayment(manual.paymentId, { status: "succeeded" }, new Date("2026-11-20T00:00:00Z"));
    expect((await sub(e.organizationId)).currentPeriodEnd!.toISOString().slice(0, 10)).toBe("2027-01-11"); // extiende desde el fin vigente
    const change = await startCheckout({ ...e, planId: "AGENCY", consentRecurring: false }, new Date("2026-11-21T00:00:00Z"));
    expect((await db.payment.findUniqueOrThrow({ where: { id: change.paymentId } })).kind).toBe("CHANGE");
    await settlePayment(change.paymentId, { status: "succeeded" }, new Date("2026-11-21T00:00:00Z"));
    expect(await sub(e.organizationId)).toMatchObject({ planId: "AGENCY", priceMinor: 399_999 });
  });
});

describe("webhooks", () => {
  const post = (provider: string, body: object, secret = "whsec_test") => {
    const raw = JSON.stringify(body);
    return handleWebhook(provider, raw, new Headers({ "x-zentra-signature": signSimulatedWebhook(raw, secret) }));
  };
  it("verifica la firma, procesa una sola vez cada evento e ignora lo desconocido", async () => {
    const e = await mk("a@x.com"); const c = await startCheckout({ ...e, planId: "START", consentRecurring: true });
    const ref = (await db.payment.findUniqueOrThrow({ where: { id: c.paymentId } })).providerRef!;
    expect((await post("simulated", { id: "e1", type: "payment.succeeded", providerRef: ref }, "otro_secreto")).status).toBe(400);
    expect((await handleWebhook("simulated", "{}", new Headers())).status).toBe(400);
    expect((await post("noexiste", { id: "x" })).status).toBe(404);
    expect((await sub(e.organizationId)).status).toBe("TRIALING");
    expect((await post("simulated", { id: "e1", type: "payment.succeeded", providerRef: ref, paymentMethodToken: "simtok_w" })).body).toEqual({ applied: true });
    expect((await post("simulated", { id: "e1", type: "payment.succeeded", providerRef: ref })).body).toEqual({ duplicate: true });
    expect((await post("simulated", { id: "e2", type: "payment.succeeded", providerRef: ref })).body).toEqual({ applied: false }); // pago ya resuelto
    expect((await post("simulated", { id: "e3", type: "payment.failed", providerRef: "sim_desconocido" })).body).toEqual({ ignored: "unknown_payment" });
    expect(await sub(e.organizationId)).toMatchObject({ status: "ACTIVE", autoRenew: true });
    expect(await db.payment.count({ where: { organizationId: e.organizationId, status: "SUCCEEDED" } })).toBe(1);
  });
});

describe("renovaciones, reintentos y cancelación", () => {
  const t0 = new Date("2026-11-11T12:00:00Z");
  const at = (days: number, plusMs = 0) => new Date(t0.getTime() + days * DAY + plusMs);
  async function active(email = "a@x.com", consent = true) { const e = await mk(email); await pay(e, "BUSINESS", { consent, now: t0 }); return e; }

  it("renueva automáticamente con el precio de cuando se suscribió, aunque el precio actual cambie", async () => {
    const admin = await mk("adm@x.com"); await db.user.update({ where: { id: admin.userId }, data: { platformRole: "SUPERADMIN" } });
    const e = await active();
    await setPlanPrice(admin.userId, { planId: "BUSINESS", countryCode: "PY", currency: "PYG", amountMinor: 500_000, taxIncluded: true, taxPercent: null, active: true });
    const end = (await sub(e.organizationId)).currentPeriodEnd!;
    expect(await runBillingCycle(new Date(end.getTime() - 5 * DAY))).toMatchObject({ renewed: 0 });
    expect((await runBillingCycle(new Date(end.getTime() + 3600_000))).renewed).toBe(1);
    const s = await sub(e.organizationId);
    expect(s.currentPeriodEnd!.toISOString().slice(0, 10)).toBe("2027-01-11");
    const renewal = await db.payment.findFirstOrThrow({ where: { organizationId: e.organizationId, kind: "RENEWAL" } });
    expect(renewal).toMatchObject({ status: "SUCCEEDED", amountMinor: 199_999, consentRecurring: true });
    await runBillingCycle(new Date(end.getTime() + 7200_000)); // no vuelve a cobrar el mismo período
    expect(await db.payment.count({ where: { organizationId: e.organizationId, kind: "RENEWAL" } })).toBe(1);
  });
  it("sin autorización de cobro automático NO se cobra: el plan vence con aviso y los datos se conservan", async () => {
    const e = await active("a@x.com", false);
    const end = (await sub(e.organizationId)).currentPeriodEnd!;
    await runBillingCycle(new Date(end.getTime() - 2 * DAY));
    expect((await notes(e.organizationId)).some((n) => n.title === "Tu plan vence pronto")).toBe(true);
    expect((await runBillingCycle(new Date(end.getTime() + 1000))).expired).toBe(1);
    expect(await db.payment.count({ where: { organizationId: e.organizationId, kind: "RENEWAL" } })).toBe(0);
    expect((await getAccess(e.organizationId, new Date(end.getTime() + 2000))).premium).toBe(false);
  });
  it("reintenta el cobro 3 veces (+1, +3 y +5 días), mantiene acceso en gracia y luego vence", async () => {
    setSimulatedChargesFail(true);
    const e = await active();
    const end = (await sub(e.organizationId)).currentPeriodEnd!;
    const day = (n: number) => new Date(end.getTime() + n * DAY + 1000);
    await runBillingCycle(day(0));
    let s = await sub(e.organizationId);
    expect([s.status, s.retryCount]).toEqual(["PAST_DUE", 1]); expect(s.nextRetryAt!.getTime() - day(0).getTime()).toBeCloseTo(DAY, -4);
    expect((await getAccess(e.organizationId, day(0))).state).toBe("past_due"); expect((await getAccess(e.organizationId, day(0))).premium).toBe(true);
    await runBillingCycle(day(0.5)); expect(await db.payment.count({ where: { organizationId: e.organizationId, kind: "RENEWAL" } })).toBe(1); // aún no toca
    await runBillingCycle(day(1.1)); s = await sub(e.organizationId); expect([s.status, s.retryCount]).toEqual(["PAST_DUE", 2]);
    await runBillingCycle(day(4.2)); s = await sub(e.organizationId); expect([s.status, s.retryCount]).toEqual(["PAST_DUE", 3]);
    await runBillingCycle(day(9.3)); s = await sub(e.organizationId); expect([s.status, s.retryCount]).toEqual(["EXPIRED", 4]);
    expect((await getAccess(e.organizationId, day(9.3))).premium).toBe(false);
    const pays = await db.payment.findMany({ where: { organizationId: e.organizationId, kind: "RENEWAL" } });
    expect(pays).toHaveLength(4); expect(pays.every((p) => p.status === "FAILED")).toBe(true);
    expect((await notes(e.organizationId)).some((n) => n.title === "Tu suscripción venció por falta de pago")).toBe(true);
    setSimulatedChargesFail(false);
    await pay(e, "BUSINESS", { consent: true, now: day(10) }); // reactivar
    expect((await sub(e.organizationId)).status).toBe("ACTIVE");
  });
  it("si un reintento funciona, vuelve a estar al día", async () => {
    setSimulatedChargesFail(true);
    const e = await active(); const end = (await sub(e.organizationId)).currentPeriodEnd!;
    await runBillingCycle(new Date(end.getTime() + 1000));
    setSimulatedChargesFail(false);
    await runBillingCycle(new Date(end.getTime() + 1.1 * DAY));
    expect(await sub(e.organizationId)).toMatchObject({ status: "ACTIVE", retryCount: 0, nextRetryAt: null });
  });
  it("cancelar mantiene el acceso hasta el fin del período, detiene el cobro y se puede deshacer", async () => {
    const e = await active(); const end = (await sub(e.organizationId)).currentPeriodEnd!;
    await cancelSubscription(e, t0);
    expect(await sub(e.organizationId)).toMatchObject({ cancelAtPeriodEnd: true, autoRenew: false });
    expect((await getAccess(e.organizationId, new Date(end.getTime() - DAY))).premium).toBe(true);
    await resumeSubscription(e); expect((await sub(e.organizationId)).cancelAtPeriodEnd).toBe(false);
    await cancelSubscription(e, t0);
    const r = await runBillingCycle(new Date(end.getTime() + 1000));
    expect(r.canceled).toBe(1); expect((await sub(e.organizationId)).status).toBe("CANCELED");
    expect(await db.payment.count({ where: { organizationId: e.organizationId, kind: "RENEWAL" } })).toBe(0);
  });
  it("cancelar con un pago en mora detiene los reintentos", async () => {
    setSimulatedChargesFail(true);
    const e = await active(); const end = (await sub(e.organizationId)).currentPeriodEnd!;
    await runBillingCycle(new Date(end.getTime() + 1000));
    await cancelSubscription(e); expect(await sub(e.organizationId)).toMatchObject({ status: "CANCELED", nextRetryAt: null });
  });
});

describe("acceso por plan (los datos nunca se borran)", () => {
  async function withData(e: E) {
    const acct = await db.adAccount.create({ data: { organizationId: e.organizationId, platform: "META", externalId: "act_1", name: "C", syncEnabled: true, accessTokenEnc: encryptSecret("T") } });
    const camp = await db.campaign.create({ data: { organizationId: e.organizationId, adAccountId: acct.id, externalId: "c1", name: "K", objective: "MESSAGES", status: "ACTIVE" } });
    return { acct, camp };
  }
  it("con la suscripción vencida: se bloquean sincronización, automatizaciones, IA, reglas y ventas, pero los datos siguen ahí", async () => {
    const e = await mk("a@x.com"); const { acct } = await withData(e);
    await db.subscription.updateMany({ where: { organizationId: e.organizationId }, data: { status: "EXPIRED" } });
    expect((await syncAdAccount(acct.id, { fetcher: (async () => { throw new Error("no debe llamarse"); }) as any })).skipped).toBe("suscripción inactiva");
    expect((await evaluateOrganization(e.organizationId)).reason).toBe("Suscripción inactiva");
    expect((await askAssistant({ organizationId: e.organizationId, userId: e.userId, currency: "PYG", question: "¿Cuánto gasté?" }, { llm: null })).limited).toBe(true);
    await expect(createRule(e, { name: "Regla", scope: "ACCOUNT", scopeId: null, config: { kind: "BUDGET_ALERT", maxDailyBudget: 100 } })).rejects.toBeInstanceOf(PlanError);
    await expect(createSale(e, { revenue: 100 })).rejects.toBeInstanceOf(PlanError);
    await expect(saveSettings(e, { mode: "ASSISTED", enabled: true, dryRun: true, notifyEmail: false, confirmReal: false, maxActionsPerDay: 5, activeFromHour: 0, activeToHour: 24 })).rejects.toBeInstanceOf(PlanError);
    expect(await db.adAccount.count({ where: { organizationId: e.organizationId } })).toBe(1); expect(await db.campaign.count({ where: { organizationId: e.organizationId } })).toBe(1);
  });
  it("Start: 2 reglas máximo, sin análisis comercial y asistente por reglas aunque haya IA", async () => {
    const e = await mk("a@x.com", { planId: "START" }); const { camp } = await withData(e);
    const rule = (n: string) => createRule(e, { name: n, scope: "CAMPAIGN", scopeId: camp.id, config: { kind: "BUDGET_ALERT", maxDailyBudget: 100 } });
    await rule("Uno"); await rule("Dos");
    await expect(rule("Tres")).rejects.toThrow(/hasta 2 reglas/);
    await expect(createSale(e, { revenue: 100 })).rejects.toThrow(/no está incluida en tu plan Start/);
    const llm: LLM = { model: "m", complete: async () => { throw new Error("no debe usarse"); } };
    const r = await askAssistant({ organizationId: e.organizationId, userId: e.userId, currency: "PYG", question: "¿Cuánto gasté?" }, { llm });
    expect(r.mode).toBe("rules"); expect(r.notice).toBeUndefined();
  });
  it("Business: IA avanzada y análisis comercial disponibles", async () => {
    const e = await mk("a@x.com", { planId: "BUSINESS" });
    const llm: LLM = { model: "m", complete: async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: "ok", citations: null } as any] }) };
    expect((await askAssistant({ organizationId: e.organizationId, userId: e.userId, currency: "PYG", question: "hola" }, { llm })).mode).toBe("ai");
    expect((await createSale(e, { revenue: 100 })).id).toBeTruthy();
  });
});

describe("panel administrador", () => {
  async function admin() { const a = await mk("adm@x.com"); await db.user.update({ where: { id: a.userId }, data: { platformRole: "SUPERADMIN" } }); return a; }
  it("solo un propietario de la plataforma puede operar; todo queda auditado", async () => {
    const a = await admin(); const e = await mk("a@x.com");
    await expect(setPlanPrice(e.userId, { planId: "START", countryCode: "AR", currency: "ARS", amountMinor: 1000, taxIncluded: true, taxPercent: null, active: true })).rejects.toThrow(/propietarios/);
    await expect(setOrgStatus(e.userId, e.organizationId, "SUSPENDED")).rejects.toBeInstanceOf(ServiceError);
    await expect(assertSuperAdmin("inexistente")).rejects.toBeInstanceOf(ServiceError);
    await setPlanPrice(a.userId, { planId: "START", countryCode: "ar", currency: "ars", amountMinor: 15000, taxIncluded: false, taxPercent: 21, active: true });
    expect(await priceFor("START", "AR")).toMatchObject({ currency: "ARS", amountMinor: 15000 });
    await expect(setPlanPrice(a.userId, { planId: "START", countryCode: "ARG", currency: "ARS", amountMinor: 1, taxIncluded: true, taxPercent: null, active: true })).rejects.toThrow();
    expect(await db.auditLog.count({ where: { action: "admin.price_set" } })).toBe(1);
  });
  it("suspender una organización o un usuario; no se puede suspender a un propietario", async () => {
    const a = await admin(); const e = await mk("a@x.com");
    await db.session.create({ data: { userId: e.userId, tokenHash: "h", expiresAt: new Date(Date.now() + DAY) } });
    await setUserStatus(a.userId, e.userId, "SUSPENDED");
    expect(await db.session.count({ where: { userId: e.userId } })).toBe(0);
    await expect(setUserStatus(a.userId, a.userId, "SUSPENDED")).rejects.toThrow(/propietario/);
    await setOrgStatus(a.userId, e.organizationId, "SUSPENDED");
    expect((await db.organization.findUniqueOrThrow({ where: { id: e.organizationId } })).status).toBe("SUSPENDED");
    expect((await db.auditLog.findMany({ where: { action: { startsWith: "admin." } } })).length).toBe(2);
  });
  it("el resumen general no expone datos de los clientes", async () => {
    await admin(); const e = await mk("a@x.com"); await pay(e, "START");
    const o = await adminOverview();
    expect(o.users).toBe(2); expect(o.subscriptions.ACTIVE).toBe(1); expect(o.revenue30d[0]).toMatchObject({ currency: "PYG", simulated: true, amountMinor: 99_999 });
    expect(JSON.stringify(o)).not.toMatch(/accessToken|passwordHash|paymentMethod/i);
  });
});
