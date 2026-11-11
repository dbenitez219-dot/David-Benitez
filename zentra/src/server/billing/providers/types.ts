/**
 * Interfaz común de proveedores de pago. Cada proveedor declara en qué países/monedas opera y si admite cobros recurrentes:
 * no se asume que uno funcione en todos los mercados. ZENTRA nunca guarda datos de tarjeta: solo un token del proveedor.
 */
export type CheckoutInput = { organizationId: string; subscriptionId: string; paymentId: string; amountMinor: number; currency: string; description: string; returnUrl: string; saveCard: boolean };
export type CheckoutResult = { providerRef: string; checkoutUrl: string };
export type ChargeInput = { paymentMethodToken: string; amountMinor: number; currency: string; reference: string };
export type ChargeResult = { status: "succeeded" | "failed"; providerRef: string; reason?: string };
export type ProviderEvent = { id: string; type: "payment.succeeded" | "payment.failed"; providerRef: string; paymentMethodToken?: string; reason?: string };

export interface PaymentProvider {
  id: string;
  name: string;
  countries: string[] | "*";
  currencies: string[] | "*";
  supportsRecurring: boolean;
  /** true si es un proveedor falso para pruebas: sus pagos se marcan como simulados y no cobran nada. */
  simulated: boolean;
  enabled(): boolean;
  createCheckout(i: CheckoutInput): Promise<CheckoutResult>;
  /** Cobro recurrente con el token autorizado por el cliente. */
  charge(i: ChargeInput): Promise<ChargeResult>;
  verifyWebhook(rawBody: string, headers: Headers): ProviderEvent | null;
}
