import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { ChargeInput, ChargeResult, CheckoutInput, CheckoutResult, PaymentProvider, ProviderEvent } from "./types";

/**
 * PROVEEDOR FALSO. No cobra nada ni se conecta a ningún banco. Sirve para probar y demostrar el flujo.
 * Se permite solo fuera de producción, o en producción si se activa ALLOW_SIMULATED_PAYMENTS=true a propósito.
 */
export const simulatedAllowed = () => process.env.ALLOW_SIMULATED_PAYMENTS === "true" || process.env.NODE_ENV !== "production";

let failCharges = false;
/** Solo para pruebas: hace que los cobros recurrentes simulados fallen. */
export const setSimulatedChargesFail = (v: boolean) => { failCharges = v; };

export const signSimulatedWebhook = (raw: string, secret: string) => createHmac("sha256", secret).update(raw).digest("hex");

export const simulatedProvider: PaymentProvider = {
  id: "simulated", name: "Pago simulado (no cobra nada)", countries: "*", currencies: "*", supportsRecurring: true, simulated: true,
  enabled: simulatedAllowed,
  async createCheckout(i: CheckoutInput): Promise<CheckoutResult> {
    const providerRef = `sim_${randomBytes(9).toString("hex")}`;
    return { providerRef, checkoutUrl: `${i.returnUrl.replace(/\/$/, "")}/billing/simulated?ref=${providerRef}` };
  },
  async charge(i: ChargeInput): Promise<ChargeResult> {
    const providerRef = `sim_${randomBytes(9).toString("hex")}`;
    return failCharges ? { status: "failed", providerRef, reason: "Pago simulado rechazado" } : { status: "succeeded", providerRef };
  },
  verifyWebhook(raw, headers): ProviderEvent | null {
    const secret = process.env.BILLING_WEBHOOK_SECRET;
    const sig = headers.get("x-zentra-signature") ?? "";
    if (!secret || !sig) return null;
    const expected = signSimulatedWebhook(raw, secret);
    if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    try {
      const e = JSON.parse(raw);
      return typeof e?.id === "string" && typeof e?.providerRef === "string" && (e.type === "payment.succeeded" || e.type === "payment.failed") ? e : null;
    } catch { return null; }
  },
};
