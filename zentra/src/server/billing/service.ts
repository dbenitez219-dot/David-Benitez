import { db } from "@/lib/db";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { audit } from "@/server/audit/audit";
import { ServiceError } from "@/server/errors";
import { notifyOnce } from "@/server/notifications/notify";
import { getAccess } from "./access";
import { addMonths, PLAN_IDS, priceFor, taxBreakdown, TRIAL_DAYS, type PlanId } from "./plans";
import { getProvider, providerFor } from "./providers";
import type { ProviderEvent } from "./providers/types";

const DAY = 86_400_000;
const RETRY_DAYS = [1, 3, 5]; // tras cada fallo de renovación; al 4.º fallo la suscripción vence
type Who = { organizationId: string; userId: string };

/** Crea la suscripción de prueba (7 días, sin tarjeta). Una sola prueba por organización. */
export async function startTrial(p: Who & { planId: PlanId }, now = new Date()) {
  if (!PLAN_IDS.includes(p.planId)) throw new ServiceError("Plan inválido.");
  const prior = await db.subscription.findFirst({ where: { organizationId: p.organizationId } });
  if (prior) throw new ServiceError("Tu organización ya usó la prueba gratuita.");
  const sub = await db.subscription.create({ data: { organizationId: p.organizationId, planId: p.planId, status: "TRIALING", trialEndsAt: new Date(now.getTime() + TRIAL_DAYS * DAY) } });
  await audit({ action: "billing.trial_start", userId: p.userId, organizationId: p.organizationId, metadata: { plan: p.planId } });
  return sub;
}

/**
 * Inicia un pago. NO cobra por sí mismo: devuelve la URL del proveedor donde el cliente autoriza el pago.
 * El cobro recurrente solo se habilita si el cliente lo autoriza expresamente (consentRecurring).
 */
export async function startCheckout(p: Who & { planId: PlanId; consentRecurring: boolean; returnUrl: string }, now = new Date()) {
  if (!PLAN_IDS.includes(p.planId)) throw new ServiceError("Plan inválido.");
  const org = await db.organization.findUniqueOrThrow({ where: { id: p.organizationId }, select: { countryCode: true } });
  const price = await priceFor(p.planId, org.countryCode);
  if (!price) throw new ServiceError("Este plan todavía no tiene precio definido para tu país.");
  const provider = providerFor(org.countryCode, price.currency);
  if (!provider) throw new ServiceError("Los pagos todavía no están habilitados para tu país y moneda.");
  if (p.consentRecurring && !provider.supportsRecurring) throw new ServiceError("Este medio de pago no admite cobros automáticos.");

  let sub = await db.subscription.findFirst({ where: { organizationId: p.organizationId }, orderBy: { createdAt: "desc" } });
  if (!sub) sub = await db.subscription.create({ data: { organizationId: p.organizationId, planId: p.planId, status: "EXPIRED" } });
  const live = sub.status === "ACTIVE" && !!sub.currentPeriodEnd && sub.currentPeriodEnd > now;
  const kind = live ? (sub.planId === p.planId ? "MANUAL_RENEWAL" : "CHANGE") : "INITIAL";
  const tax = taxBreakdown(price.amountMinor, price.taxIncluded, price.taxPercent === null ? null : Number(price.taxPercent));

  const payment = await db.payment.create({ data: {
    organizationId: p.organizationId, subscriptionId: sub.id, planId: p.planId, kind, amountMinor: tax.total, taxMinor: tax.tax, currency: price.currency,
    status: "PENDING", provider: provider.id, isSimulated: provider.simulated, consentRecurring: p.consentRecurring,
  } });
  const r = await provider.createCheckout({ organizationId: p.organizationId, subscriptionId: sub.id, paymentId: payment.id, amountMinor: tax.total, currency: price.currency, description: `ZENTRA ${p.planId}`, returnUrl: p.returnUrl, saveCard: p.consentRecurring });
  await db.payment.update({ where: { id: payment.id }, data: { providerRef: r.providerRef } });
  await audit({ action: "billing.checkout", userId: p.userId, organizationId: p.organizationId, entity: "Payment", entityId: payment.id, metadata: { plan: p.planId, provider: provider.id, recurringConsent: p.consentRecurring, amountMinor: tax.total, currency: price.currency } });
  return { url: r.checkoutUrl, paymentId: payment.id };
}

export type Outcome = { status: "succeeded" | "failed"; paymentMethodToken?: string; reason?: string };

/**
 * Registra el resultado de un pago (desde el webhook, el retorno del proveedor o un cobro recurrente). Idempotente:
 * solo un proceso puede resolver un pago PENDIENTE, así una notificación repetida no activa ni cobra dos veces.
 */
export async function settlePayment(paymentId: string, o: Outcome, now = new Date()): Promise<{ applied: boolean }> {
  const claim = await db.payment.updateMany({ where: { id: paymentId, status: "PENDING" }, data: o.status === "succeeded" ? { status: "SUCCEEDED", paidAt: now } : { status: "FAILED", failureReason: (o.reason ?? "Pago rechazado").slice(0, 300) } });
  if (claim.count === 0) return { applied: false };
  const pay = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
  const orgId = pay.organizationId;

  if (o.status === "failed") {
    await audit({ action: "billing.payment_failed", organizationId: orgId, entity: "Payment", entityId: pay.id, metadata: { kind: pay.kind, reason: o.reason ?? null } });
    if (pay.kind === "RENEWAL" && pay.subscriptionId) await scheduleRetry(pay.subscriptionId, now);
    else await notifyOnce(orgId, { type: "billing", severity: "warning", dedupeHours: 1, title: "El pago no se completó", body: o.reason ?? "El proveedor rechazó el pago.", recommendation: "Puedes intentarlo de nuevo desde «Plan y pagos» con otro medio de pago." });
    return { applied: true };
  }

  const sub = await db.subscription.findUniqueOrThrow({ where: { id: pay.subscriptionId! } });
  const org = await db.organization.findUniqueOrThrow({ where: { id: orgId }, select: { countryCode: true } });
  const price = await priceFor(pay.planId ?? sub.planId, org.countryCode);
  const extendsPeriod = pay.kind === "RENEWAL" || pay.kind === "MANUAL_RENEWAL";
  const base = extendsPeriod && sub.currentPeriodEnd && sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now;
  const autoRenew = pay.consentRecurring && !!(o.paymentMethodToken ?? (pay.kind === "RENEWAL" ? "reuse" : undefined));
  await db.subscription.update({ where: { id: sub.id }, data: {
    planId: pay.planId ?? sub.planId, status: "ACTIVE", currentPeriodEnd: addMonths(base, 1), cancelAtPeriodEnd: false, canceledAt: null, retryCount: 0, nextRetryAt: null,
    provider: pay.provider, priceMinor: pay.amountMinor, currency: pay.currency, taxPercent: price?.taxPercent ?? sub.taxPercent,
    ...(pay.kind === "RENEWAL" ? {} : { autoRenew, consentAt: autoRenew ? now : null, paymentMethodEnc: autoRenew && o.paymentMethodToken ? encryptSecret(o.paymentMethodToken) : null }),
  } });
  await audit({ action: "billing.payment_succeeded", organizationId: orgId, entity: "Payment", entityId: pay.id, metadata: { kind: pay.kind, plan: pay.planId, amountMinor: pay.amountMinor, simulated: pay.isSimulated, autoRenew } });
  await notifyOnce(orgId, { type: "billing", severity: "info", dedupeHours: 1, title: pay.kind === "RENEWAL" ? "Renovamos tu suscripción" : "Tu suscripción está activa", body: `Pago recibido${pay.isSimulated ? " (SIMULADO: no se cobró nada)" : ""}.`, recommendation: autoRenew ? "Se renovará automáticamente cada mes; puedes cancelar cuando quieras." : "No hay cobro automático: recuerda renovar antes de que venza." });
  return { applied: true };
}

async function scheduleRetry(subscriptionId: string, now: Date) {
  const sub = await db.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
  const failures = sub.retryCount + 1;
  if (failures > RETRY_DAYS.length) {
    await db.subscription.update({ where: { id: sub.id }, data: { status: "EXPIRED", retryCount: failures, nextRetryAt: null } });
    await audit({ action: "billing.expired_unpaid", organizationId: sub.organizationId, entity: "Subscription", entityId: sub.id });
    await notifyOnce(sub.organizationId, { type: "billing", severity: "important", title: "Tu suscripción venció por falta de pago", body: "No pudimos cobrar la renovación tras varios intentos. Tus datos se conservan; las funciones premium quedaron limitadas.", recommendation: "Entra a «Plan y pagos» y reactiva tu suscripción con un medio de pago vigente." });
    return;
  }
  const next = new Date(now.getTime() + RETRY_DAYS[failures - 1] * DAY);
  await db.subscription.update({ where: { id: sub.id }, data: { status: "PAST_DUE", retryCount: failures, nextRetryAt: next } });
  await notifyOnce(sub.organizationId, { type: "billing", severity: "important", dedupeHours: 12, title: "No pudimos cobrar tu renovación", body: `Reintentaremos el ${next.toISOString().slice(0, 10)}. Mientras tanto conservas el acceso.`, recommendation: "Verifica que tu medio de pago tenga fondos o actualízalo en «Plan y pagos»." });
}

/** Cobro recurrente: SOLO con autorización registrada del cliente (autoRenew + consentimiento + token). */
async function chargeRenewal(sub: Awaited<ReturnType<typeof db.subscription.findUniqueOrThrow>>, now: Date): Promise<"charged" | "failed" | "skipped"> {
  const provider = sub.provider ? getProvider(sub.provider) : null;
  if (!sub.autoRenew || !sub.consentAt || !sub.paymentMethodEnc || !sub.priceMinor || !sub.currency || !provider?.supportsRecurring) return "skipped";
  const pay = await db.payment.create({ data: {
    organizationId: sub.organizationId, subscriptionId: sub.id, planId: sub.planId, kind: "RENEWAL", amountMinor: sub.priceMinor, currency: sub.currency, status: "PENDING",
    provider: provider.id, isSimulated: provider.simulated, attempt: sub.retryCount + 1, consentRecurring: true,
    taxMinor: sub.taxPercent ? sub.priceMinor - Math.round(sub.priceMinor / (1 + Number(sub.taxPercent) / 100)) : 0,
  } });
  let res;
  try { res = await provider.charge({ paymentMethodToken: decryptSecret(sub.paymentMethodEnc), amountMinor: sub.priceMinor, currency: sub.currency, reference: pay.id }); }
  catch (e) { res = { status: "failed" as const, providerRef: `err_${pay.id}`, reason: (e as Error).message }; }
  await db.payment.update({ where: { id: pay.id }, data: { providerRef: res.providerRef } });
  await settlePayment(pay.id, { status: res.status, reason: res.reason }, now);
  return res.status === "succeeded" ? "charged" : "failed";
}

export type CycleSummary = { trialsExpired: number; trialWarnings: number; renewed: number; retriesFailed: number; expired: number; canceled: number };

/** Ciclo diario: avisos y vencimiento de pruebas, renovaciones, reintentos y cancelaciones al fin del período. */
export async function runBillingCycle(now = new Date()): Promise<CycleSummary> {
  const out: CycleSummary = { trialsExpired: 0, trialWarnings: 0, renewed: 0, retriesFailed: 0, expired: 0, canceled: 0 };

  for (const s of await db.subscription.findMany({ where: { status: "TRIALING", trialEndsAt: { not: null } } })) {
    const end = s.trialEndsAt!, left = end.getTime() - now.getTime();
    if (left <= 0) {
      await db.subscription.update({ where: { id: s.id }, data: { status: "EXPIRED" } }); out.trialsExpired++;
      await notifyOnce(s.organizationId, { type: "billing", severity: "important", title: "Tu prueba gratuita terminó", body: "Tus datos están a salvo, pero las funciones premium quedaron limitadas.", recommendation: "Activa tu plan en «Plan y pagos» para seguir usando ZENTRA completo." });
    } else if (left <= DAY && !s.trialWarned1) {
      await db.subscription.update({ where: { id: s.id }, data: { trialWarned1: now, trialWarned3: s.trialWarned3 ?? now } }); out.trialWarnings++;
      await notifyOnce(s.organizationId, { type: "billing", severity: "important", dedupeHours: 48, title: "Tu prueba gratuita termina en menos de 24 horas", body: "No se cobrará nada automáticamente al terminar la prueba.", recommendation: "Si quieres continuar, activa tu plan en «Plan y pagos»." });
    } else if (left <= 3 * DAY && !s.trialWarned3) {
      await db.subscription.update({ where: { id: s.id }, data: { trialWarned3: now } }); out.trialWarnings++;
      await notifyOnce(s.organizationId, { type: "billing", severity: "warning", dedupeHours: 48, title: "Tu prueba gratuita termina en 3 días", body: "No se cobrará nada automáticamente al terminar la prueba.", recommendation: "Elige tu plan en «Plan y pagos» cuando quieras continuar." });
    }
  }

  for (const s of await db.subscription.findMany({ where: { status: "ACTIVE", currentPeriodEnd: { not: null } } })) {
    const end = s.currentPeriodEnd!;
    if (end > now) {
      if (!s.autoRenew && !s.cancelAtPeriodEnd && end.getTime() - now.getTime() <= 3 * DAY)
        await notifyOnce(s.organizationId, { type: "billing", severity: "warning", dedupeHours: 72, title: "Tu plan vence pronto", body: `Tu plan vence el ${end.toISOString().slice(0, 10)} y no tiene cobro automático.`, recommendation: "Renueva desde «Plan y pagos» para no perder las funciones premium." });
      continue;
    }
    if (s.cancelAtPeriodEnd) {
      await db.subscription.update({ where: { id: s.id }, data: { status: "CANCELED", autoRenew: false } }); out.canceled++;
      await audit({ action: "billing.canceled_at_period_end", organizationId: s.organizationId, entity: "Subscription", entityId: s.id });
      await notifyOnce(s.organizationId, { type: "billing", severity: "info", title: "Tu suscripción finalizó", body: "Cancelaste tu suscripción y llegó la fecha de fin. Tus datos se conservan.", recommendation: "Puedes reactivarla cuando quieras desde «Plan y pagos»." });
      continue;
    }
    const r = await chargeRenewal(s, now);
    if (r === "charged") out.renewed++; else if (r === "failed") out.retriesFailed++;
    else { await db.subscription.update({ where: { id: s.id }, data: { status: "EXPIRED" } }); out.expired++;
      await notifyOnce(s.organizationId, { type: "billing", severity: "important", title: "Tu suscripción venció", body: "Tu plan no tenía cobro automático y llegó la fecha de vencimiento. Tus datos se conservan.", recommendation: "Renueva desde «Plan y pagos» para recuperar las funciones premium." }); }
  }

  for (const s of await db.subscription.findMany({ where: { status: "PAST_DUE", nextRetryAt: { lte: now } } })) {
    const r = await chargeRenewal(s, now);
    if (r === "charged") out.renewed++; else if (r === "failed") out.retriesFailed++; else { await scheduleRetry(s.id, now); out.retriesFailed++; }
  }
  return out;
}

/** Cancelar: se mantiene el acceso hasta el fin del período pagado y se detiene el cobro automático. */
export async function cancelSubscription(p: Who, now = new Date()) {
  const sub = await db.subscription.findFirst({ where: { organizationId: p.organizationId, status: { in: ["TRIALING", "ACTIVE", "PAST_DUE"] } }, orderBy: { createdAt: "desc" } });
  if (!sub) throw new ServiceError("No tienes una suscripción para cancelar.");
  await db.subscription.update({ where: { id: sub.id }, data: sub.status === "PAST_DUE"
    ? { status: "CANCELED", autoRenew: false, canceledAt: now, nextRetryAt: null }
    : { cancelAtPeriodEnd: true, autoRenew: false, canceledAt: now } });
  await audit({ action: "billing.cancel", userId: p.userId, organizationId: p.organizationId, entity: "Subscription", entityId: sub.id });
}

/** Deshace una cancelación programada (el cobro automático NO se reactiva: requiere una nueva autorización al pagar). */
export async function resumeSubscription(p: Who) {
  const sub = await db.subscription.findFirst({ where: { organizationId: p.organizationId, status: { in: ["TRIALING", "ACTIVE"] }, cancelAtPeriodEnd: true } });
  if (!sub) throw new ServiceError("No hay una cancelación programada.");
  await db.subscription.update({ where: { id: sub.id }, data: { cancelAtPeriodEnd: false, canceledAt: null } });
  await audit({ action: "billing.resume", userId: p.userId, organizationId: p.organizationId, entity: "Subscription", entityId: sub.id });
}

/** Procesa una notificación (webhook) de un proveedor: firma verificada, idempotente. Devuelve el código HTTP. */
export async function handleWebhook(providerId: string, raw: string, headers: Headers): Promise<{ status: number; body: object }> {
  const provider = getProvider(providerId);
  if (!provider) return { status: 404, body: { error: "unknown_provider" } };
  const ev: ProviderEvent | null = provider.verifyWebhook(raw, headers);
  if (!ev) return { status: 400, body: { error: "invalid_signature" } };
  const fresh = await db.webhookEvent.createMany({ data: [{ provider: provider.id, eventId: ev.id }], skipDuplicates: true });
  if (fresh.count === 0) return { status: 200, body: { duplicate: true } };
  const pay = await db.payment.findFirst({ where: { provider: provider.id, providerRef: ev.providerRef } });
  if (!pay) return { status: 200, body: { ignored: "unknown_payment" } };
  const r = await settlePayment(pay.id, { status: ev.type === "payment.succeeded" ? "succeeded" : "failed", paymentMethodToken: ev.paymentMethodToken, reason: ev.reason });
  return { status: 200, body: r };
}

export { getAccess };
