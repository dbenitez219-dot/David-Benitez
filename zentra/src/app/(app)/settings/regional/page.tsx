import { ActionForm } from "@/components/ActionForm";
import { CountrySelect } from "@/components/CountrySelect";
import { PhoneField } from "@/components/PhoneField";
import { currencies, currencyName, listCountries, timezones } from "@/lib/countries";
import { LOCALES, LOCALE_NAMES } from "@/lib/i18n";
import { getRegional } from "@/lib/locale";
import { splitPhone } from "@/lib/phone";
import { hasRole, requireOrg } from "@/server/tenancy/context";
import { saveOrgRegionalAction, saveUserRegionalAction } from "./actions";

export const metadata = { title: "ZENTRA" };

export default async function RegionalPage() {
  const ctx = await requireOrg();
  const { t, fmt, locale } = await getRegional();
  const countries = listCountries(locale);
  const picker = { search: t("picker.search"), none: t("picker.none") };
  const phone = splitPhone(ctx.user.phone);
  const admin = hasRole(ctx.role, "ADMIN");
  const tzList = timezones();
  return (
    <div className="animate-rise max-w-3xl space-y-6">
      <div><h1 className="text-2xl font-bold">{t("reg.title")}</h1><p className="text-sm text-muted">{t("reg.sub")}</p></div>
      <datalist id="tzs">{tzList.map((z) => <option key={z} value={z} />)}</datalist>

      <section className="card p-5">
        <h2 className="mb-1 font-semibold">{t("reg.you")}</h2>
        <p className="mb-4 text-xs text-muted">{t("reg.preview", { number: fmt.money(1234567.89, ctx.organization.currency), date: fmt.dateTime(new Date()) })}</p>
        <ActionForm action={saveUserRegionalAction} submit={t("reg.save")}>
          <label className="block text-sm"><span className="mb-1 block text-muted">{t("reg.language")}</span>
            <select name="locale" defaultValue={locale} className="input">{LOCALES.map((l) => <option key={l} value={l}>{LOCALE_NAMES[l]}</option>)}</select></label>
          <label className="block text-sm"><span className="mb-1 block text-muted">{t("reg.country")}</span>
            <CountrySelect name="countryCode" countries={countries} defaultValue={ctx.user.countryCode ?? ""} labels={picker} required /></label>
          <PhoneField countries={countries} defaultCountry={phone?.country ?? ctx.user.countryCode ?? ""} defaultNumber={phone?.national ?? ""} labels={{ ...picker, number: t("picker.phonePlaceholder") }} label={t("reg.phone")} />
          <label className="block text-sm"><span className="mb-1 block text-muted">{t("reg.timezone")}</span>
            <input name="timezone" list="tzs" defaultValue={ctx.user.timezone} className="input" required autoComplete="off" /><span className="mt-1 block text-xs text-muted">{t("reg.timezoneHint")}</span></label>
        </ActionForm>
      </section>

      <section className="card p-5">
        <h2 className="mb-1 font-semibold">{t("reg.org")} · {ctx.organization.name}</h2>
        <p className="mb-4 text-xs text-muted">{t("reg.org.hint")}</p>
        {admin ? (
          <ActionForm action={saveOrgRegionalAction} submit={t("reg.save")}>
            <label className="block text-sm"><span className="mb-1 block text-muted">{t("reg.org.country")}</span>
              <CountrySelect name="countryCode" countries={countries} defaultValue={ctx.organization.countryCode ?? ""} labels={picker} required /><span className="mt-1 block text-xs text-amber-300">{t("reg.org.priceWarn")}</span></label>
            <label className="block text-sm"><span className="mb-1 block text-muted">{t("reg.org.currency")}</span>
              <input name="currency" list="ccys" defaultValue={ctx.organization.currency} className="input uppercase" maxLength={3} required autoComplete="off" />
              <datalist id="ccys">{currencies().map((c) => <option key={c} value={c}>{currencyName(c, locale)}</option>)}</datalist><span className="mt-1 block text-xs text-muted">{t("reg.org.currencyHint")}</span></label>
            <label className="block text-sm"><span className="mb-1 block text-muted">{t("reg.org.timezone")}</span>
              <input name="timezone" list="tzs" defaultValue={ctx.organization.timezone} className="input" required autoComplete="off" /></label>
          </ActionForm>
        ) : <p className="text-sm text-muted">{t("reg.readonly")}</p>}
      </section>
    </div>
  );
}
