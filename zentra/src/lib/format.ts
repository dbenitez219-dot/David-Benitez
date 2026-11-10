const LOCALE = "es-PY";

export function money(n: number, currency = "PYG") {
  const digits = currency === "PYG" ? 0 : 2;
  return new Intl.NumberFormat(LOCALE, { style: "currency", currency, maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
}
export const num = (n: number) => new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 }).format(n);
export const pct = (n: number, d = 2) => `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: d, minimumFractionDigits: d }).format(n)}%`;
export const ratio = (n: number) => `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(n)}x`;
export const dateShort = (d: Date) => new Intl.DateTimeFormat(LOCALE, { day: "2-digit", month: "short", timeZone: "UTC" }).format(d);
export const dateLong = (d: Date) => new Intl.DateTimeFormat(LOCALE, { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(d);
