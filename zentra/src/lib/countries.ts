import { getCountries, getCountryCallingCode, type CountryCode } from "libphonenumber-js/min";
import countryToCurrency from "country-to-currency";
import { getCountry, getTimezone } from "countries-and-timezones";
import flagCodes from "./flag-codes.json";
import { normalize, searchCountries, type CountryInfo } from "./countries-search";
export { normalize, searchCountries };
export type { CountryInfo };

/**
 * Registro de países. Se deriva de libphonenumber (prefijos telefónicos) ∩ banderas disponibles; los nombres salen de Intl
 * en el idioma del usuario. Agregar un país nuevo NO requiere tocar código: basta definir sus precios (panel admin) y, si hace
 * falta, un proveedor de pago que opere allí.
 */
const FLAGS = new Set(flagCodes as string[]);
const CODES: string[] = getCountries().filter((c) => FLAGS.has(c));
const CODE_SET = new Set(CODES);

export const isCountry = (code: unknown): code is string => typeof code === "string" && CODE_SET.has(code.toUpperCase());
export const flagUrl = (code: string) => `/flags/${code.toLowerCase()}.svg`;

const cache = new Map<string, CountryInfo[]>();
/** Lista de países ordenada alfabéticamente según el idioma. */
export function listCountries(locale: string): CountryInfo[] {
  const hit = cache.get(locale);
  if (hit) return hit;
  const names = new Intl.DisplayNames([locale], { type: "region" });
  const list = CODES.map((code) => ({ code, name: names.of(code) ?? code, dial: `+${getCountryCallingCode(code as CountryCode)}`, flag: flagUrl(code) }))
    .filter((c) => c.name !== c.code) // sin nombre localizado no se ofrece (evita códigos crudos como "AC")
    .sort((a, b) => a.name.localeCompare(b.name, locale));
  cache.set(locale, list);
  return list;
}

/** Moneda y zona horaria sugeridas para un país (el usuario puede cambiarlas). */
export const currencyOf = (code?: string | null): string | null => (code ? ((countryToCurrency as Record<string, string>)[code.toUpperCase()] ?? null) : null);
// Zona principal para países con varias zonas horarias (la de su mayor ciudad/capital económica).
const MAIN_TZ: Record<string, string> = {
  BR: "America/Sao_Paulo", US: "America/New_York", CA: "America/Toronto", MX: "America/Mexico_City", AR: "America/Argentina/Buenos_Aires", CL: "America/Santiago",
  EC: "America/Guayaquil", ES: "Europe/Madrid", PT: "Europe/Lisbon", FR: "Europe/Paris", GB: "Europe/London", RU: "Europe/Moscow", UA: "Europe/Kyiv", AU: "Australia/Sydney",
  NZ: "Pacific/Auckland", CN: "Asia/Shanghai", ID: "Asia/Jakarta", KZ: "Asia/Almaty", MN: "Asia/Ulaanbaatar", CD: "Africa/Kinshasa", PF: "Pacific/Tahiti", GL: "America/Nuuk",
  FM: "Pacific/Pohnpei", KI: "Pacific/Tarawa", UM: "Pacific/Wake", AQ: "Antarctica/McMurdo", NL: "Europe/Amsterdam", DK: "Europe/Copenhagen", NO: "Europe/Oslo", SJ: "Arctic/Longyearbyen",
};

/**
 * Zona horaria SUGERIDA para un país (se puede cambiar en Ajustes regionales). Un país de una sola zona devuelve esa zona; con varias,
 * la principal definida arriba o, si no está, la de desfase mediano. Nunca la primera por orden alfabético (daría p. ej. Alaska para EE. UU.).
 */
export const timezoneOf = (code?: string | null): string | null => {
  if (!code) return null;
  const c = code.toUpperCase();
  if (MAIN_TZ[c] && isTimezone(MAIN_TZ[c])) return MAIN_TZ[c];
  const country = getCountry(c as never);
  const zones = (country?.timezones ?? []).filter(isTimezone);
  if (zones.length <= 1) return zones[0] ?? null;
  const offset = (z: string) => getTimezone(z as never)?.utcOffset ?? 0;
  return [...zones].sort((a, b) => offset(a) - offset(b))[Math.floor((zones.length - 1) / 2)];
};

export const isTimezone = (tz: unknown): tz is string => {
  if (typeof tz !== "string" || !tz) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; }
};
export const timezones = (): string[] => Intl.supportedValuesOf("timeZone");
const CURRENCIES = new Set(Intl.supportedValuesOf("currency"));
export const isCurrency = (c: unknown): c is string => typeof c === "string" && CURRENCIES.has(c.toUpperCase());
export const currencies = (): string[] => [...CURRENCIES];
export const currencyName = (code: string, locale: string) => new Intl.DisplayNames([locale], { type: "currency" }).of(code) ?? code;
