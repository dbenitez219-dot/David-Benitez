import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/max";
import { isCountry } from "./countries";

/** Descompone un E.164 guardado en país y número nacional (para rellenar el formulario). */
export function splitPhone(e164: string | null | undefined): { country: string; national: string } | null {
  if (!e164) return null;
  const p = parsePhoneNumberFromString(e164);
  return p?.country ? { country: p.country, national: p.formatNational() } : null;
}

export type PhoneResult = { ok: true; e164: string; national: string } | { ok: false; reason: "country" | "invalid" };

/**
 * Valida un teléfono según las reglas del país elegido (longitud, prefijos y tipos de línea reales del plan de numeración).
 * Acepta formato nacional ("0981 123 456") o internacional ("+595 981 123456") y devuelve E.164 para guardar.
 */
export function validatePhone(country: string, input: string): PhoneResult {
  if (!isCountry(country)) return { ok: false, reason: "country" };
  const raw = input.trim();
  if (!raw || raw.length > 30) return { ok: false, reason: "invalid" };
  const p = parsePhoneNumberFromString(raw, country.toUpperCase() as CountryCode);
  if (!p || !p.isValid()) return { ok: false, reason: "invalid" };
  // Si escribió un número internacional de otro país, se respeta el del número (es lo que realmente es).
  return { ok: true, e164: p.number, national: p.formatNational() };
}
