import { currencyOf, isCountry, timezoneOf } from "@/lib/countries";
import { validatePhone } from "@/lib/phone";

export type Prepared = { ok: true; country: string; phone?: string; timezone?: string; currency?: string } | { ok: false; key: "err.country" | "err.phone" };

/**
 * Datos regionales del registro. El país lo elige la persona (nunca se deduce por IP). El teléfono es opcional, pero si se escribe
 * debe ser válido para el país elegido. Zona horaria y moneda se sugieren según el país y se pueden cambiar después.
 */
export function prepareRegistration(i: { countryCode?: string | null; phoneCountry?: string | null; phone?: string | null }): Prepared {
  const country = String(i.countryCode ?? "").toUpperCase();
  if (!isCountry(country)) return { ok: false, key: "err.country" };
  let phone: string | undefined;
  const raw = String(i.phone ?? "").trim();
  if (raw) {
    const v = validatePhone(String(i.phoneCountry || country), raw);
    if (!v.ok) return { ok: false, key: "err.phone" };
    phone = v.e164;
  }
  return { ok: true, country, phone, timezone: timezoneOf(country) ?? undefined, currency: currencyOf(country) ?? undefined };
}
