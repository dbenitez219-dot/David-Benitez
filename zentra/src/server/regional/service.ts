import { db } from "@/lib/db";
import { isCountry, isCurrency, isTimezone } from "@/lib/countries";
import { isLocale } from "@/lib/i18n";
import { validatePhone } from "@/lib/phone";
import { audit } from "@/server/audit/audit";
import { ServiceError } from "@/server/errors";

/** Error con clave de traducción (la interfaz lo muestra en el idioma del usuario). */
export class RegionalError extends ServiceError { constructor(readonly key: string) { super(key); } }

export type UserRegionalInput = { locale: string; countryCode: string; timezone: string; phoneCountry?: string; phone?: string };

/** Preferencias personales: idioma, país, zona horaria y teléfono (validado según el país). Nada se deduce por IP. */
export async function updateUserRegional(userId: string, i: UserRegionalInput) {
  if (!isLocale(i.locale)) throw new RegionalError("err.locale");
  const country = i.countryCode.toUpperCase();
  if (!isCountry(country)) throw new RegionalError("err.country");
  if (!isTimezone(i.timezone)) throw new RegionalError("err.timezone");
  let phone: string | null = null;
  if (i.phone?.trim()) {
    const v = validatePhone(i.phoneCountry || country, i.phone);
    if (!v.ok) throw new RegionalError("err.phone");
    phone = v.e164;
  }
  await db.user.update({ where: { id: userId }, data: { locale: i.locale, countryCode: country, timezone: i.timezone, phone } });
  await audit({ action: "regional.user_update", userId, metadata: { locale: i.locale, country, timezone: i.timezone, phone: phone ? "set" : "none" } });
}

export type OrgRegionalInput = { countryCode: string; currency: string; timezone: string };

/**
 * Datos regionales de la organización (administradores): el país determina qué precios de plan aplican; la moneda debe coincidir con
 * la de las cuentas publicitarias (no se convierte nada); la zona horaria rige el horario de las automatizaciones.
 */
export async function updateOrgRegional(p: { organizationId: string; userId: string }, i: OrgRegionalInput) {
  const country = i.countryCode.toUpperCase(), currency = i.currency.toUpperCase();
  if (!isCountry(country)) throw new RegionalError("err.country");
  if (!isCurrency(currency)) throw new RegionalError("err.currency");
  if (!isTimezone(i.timezone)) throw new RegionalError("err.timezone");
  await db.organization.update({ where: { id: p.organizationId }, data: { countryCode: country, currency, timezone: i.timezone } });
  await audit({ action: "regional.org_update", userId: p.userId, organizationId: p.organizationId, metadata: { country, currency, timezone: i.timezone } });
}
