import { D } from "./dictionary";

export const LOCALES = ["es", "en", "pt"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "es"; // idioma inicial
export const LOCALE_NAMES: Record<Locale, string> = { es: "Español", en: "English", pt: "Português" };
export const LOCALE_COOKIE = "zentra_locale";
export const isLocale = (x: unknown): x is Locale => typeof x === "string" && (LOCALES as readonly string[]).includes(x);

const IDX: Record<Locale, number> = { es: 0, en: 1, pt: 2 };
export type Key = keyof typeof D;
export type Vars = Record<string, string | number>;

/** Traduce una clave. Si faltara en el idioma pedido cae al español; si no existe, devuelve la propia clave. */
export function translate(locale: Locale, key: string, vars?: Vars): string {
  const row = D[key];
  const s = row ? (row[IDX[locale]] || row[0]) : key;
  return vars ? s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`)) : s;
}

/**
 * Orden de decisión del idioma: preferencia guardada del usuario > elección por cookie > español.
 * Nunca se deduce de la IP ni de la ubicación.
 */
export function resolveLocale(o: { userLocale?: string | null; cookie?: string | null }): Locale {
  if (isLocale(o.userLocale)) return o.userLocale;
  if (isLocale(o.cookie)) return o.cookie;
  return DEFAULT_LOCALE;
}

export type TFn = (key: Key | (string & {}), vars?: Vars) => string;
export const makeT = (locale: Locale): TFn => (key, vars) => translate(locale, key, vars);
