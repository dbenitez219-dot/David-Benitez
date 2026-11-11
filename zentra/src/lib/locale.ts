import { cache } from "react";
import { cookies } from "next/headers";
import { makeFormatter, formatLocale } from "./format";
import { LOCALE_COOKIE, makeT, resolveLocale, type Locale } from "./i18n";
import { getSession } from "@/server/auth/session";

/**
 * Contexto regional de la solicitud: idioma, país, zona horaria, traductor y formateadores.
 * Idioma = preferencia guardada del usuario > cookie > español. Nunca se deduce de la IP.
 */
export const getRegional = cache(async () => {
  const [session, jar] = await Promise.all([getSession(), cookies()]);
  const u = session?.user;
  const locale: Locale = resolveLocale({ userLocale: u?.locale, cookie: jar.get(LOCALE_COOKIE)?.value });
  const country = u?.countryCode ?? null;
  const timeZone = u?.timezone ?? undefined;
  return { locale, country, timeZone, t: makeT(locale), fmt: makeFormatter({ formatLocale: formatLocale(locale, country), timeZone }), signedIn: !!u };
});

export const getT = async () => (await getRegional()).t;
export const getFormatter = async () => (await getRegional()).fmt;
export const getLocale = async () => (await getRegional()).locale;
