"use client";
import type { CountryInfo } from "@/lib/countries-search";
import { CountrySelect } from "./CountrySelect";

/** Teléfono internacional: país/prefijo + número. El servidor lo valida con las reglas del país elegido. */
export function PhoneField({ countries, defaultCountry = "", defaultNumber = "", labels, hint, label }: { countries: CountryInfo[]; defaultCountry?: string; defaultNumber?: string; labels: { search: string; none: string; number: string }; hint?: string; label: string }) {
  return (
    <div className="text-sm">
      <span className="mb-1 block text-muted">{label}</span>
      <div className="grid grid-cols-[minmax(0,9.5rem)_1fr] gap-2">
        <CountrySelect name="phoneCountry" countries={countries} defaultValue={defaultCountry} labels={labels} showDial />
        <input className="input" name="phone" type="tel" defaultValue={defaultNumber} inputMode="tel" autoComplete="tel-national" placeholder={labels.number} maxLength={30} />
      </div>
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </div>
  );
}
