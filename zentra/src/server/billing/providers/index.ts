import type { PaymentProvider } from "./types";
import { simulatedProvider } from "./simulated";

/**
 * Registro de proveedores. Hoy solo existe el simulado. uPay, Bancard o una pasarela internacional se incorporan
 * implementando `PaymentProvider` y agregándolos aquí (primero los reales, el simulado al final). Ver docs/07-NEGOCIO.md.
 */
const REGISTRY: PaymentProvider[] = [simulatedProvider];

export const allProviders = () => REGISTRY;
export const getProvider = (id: string) => REGISTRY.find((p) => p.id === id && p.enabled()) ?? null;

/** Primer proveedor habilitado que opera en ese país y moneda. */
export function providerFor(countryCode: string | null | undefined, currency: string): PaymentProvider | null {
  return REGISTRY.find((p) => p.enabled()
    && (p.countries === "*" || (!!countryCode && p.countries.includes(countryCode.toUpperCase())))
    && (p.currencies === "*" || p.currencies.includes(currency))) ?? null;
}
