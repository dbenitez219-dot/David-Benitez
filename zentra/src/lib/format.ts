import { DEFAULT_LOCALE, type Locale } from "./i18n";

/** Idioma de formato por defecto (mercado inicial). */
const FALLBACK = "es-PY";
const LANG_DEFAULT: Record<Locale, string> = { es: FALLBACK, en: "en-US", pt: "pt-BR" };

/**
 * Locale de formato (separadores, orden de fecha) a partir del idioma y el país elegidos por el usuario:
 * es+MX → es-MX, en+PY → en-PY, pt+BR → pt-BR. Sin país, un valor por defecto del idioma.
 */
export function formatLocale(locale: Locale, country?: string | null): string {
  if (country && /^[A-Za-z]{2}$/.test(country)) {
    const tag = `${locale}-${country.toUpperCase()}`;
    try { if (Intl.NumberFormat.supportedLocalesOf([tag]).length) return tag; } catch { /* usa el valor por defecto */ }
  }
  return LANG_DEFAULT[locale] ?? FALLBACK;
}

export type Formatter = ReturnType<typeof makeFormatter>;

/**
 * Formateadores regionales. `dateShort/dateLong` son para fechas de calendario (datos por día: se muestran en UTC para que
 * un día no se corra por la zona horaria); `dateTime` es para instantes (se muestra en la zona horaria del usuario).
 */
export function makeFormatter(o: { formatLocale: string; timeZone?: string }) {
  const L = o.formatLocale, tz = o.timeZone;
  const safeTz = (() => { if (!tz) return undefined; try { new Intl.DateTimeFormat(L, { timeZone: tz }); return tz; } catch { return undefined; } })();
  return {
    locale: L,
    money(n: number, currency = "PYG") {
      const digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
      return new Intl.NumberFormat(L, { style: "currency", currency, maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
    },
    num: (n: number) => new Intl.NumberFormat(L, { maximumFractionDigits: 0 }).format(n),
    pct: (n: number, d = 2) => `${new Intl.NumberFormat(L, { maximumFractionDigits: d, minimumFractionDigits: d }).format(n)}%`,
    ratio: (n: number) => `${new Intl.NumberFormat(L, { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(n)}x`,
    dateShort: (d: Date) => new Intl.DateTimeFormat(L, { day: "2-digit", month: "short", timeZone: "UTC" }).format(d),
    dateLong: (d: Date) => new Intl.DateTimeFormat(L, { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(d),
    /** Fecha de un instante (p. ej. un pago) en la zona horaria del usuario. */
    dateLocal: (d: Date) => new Intl.DateTimeFormat(L, { dateStyle: "medium", timeZone: safeTz }).format(d),
    dateTime: (d: Date) => new Intl.DateTimeFormat(L, { dateStyle: "medium", timeStyle: "short", timeZone: safeTz }).format(d),
  };
}

// Valores por defecto (español de Paraguay) para código que no depende del usuario: panel admin, textos del asistente, etc.
const base = makeFormatter({ formatLocale: FALLBACK });
export const { money, num, pct, ratio, dateShort, dateLong, dateTime } = base;
export { DEFAULT_LOCALE };
