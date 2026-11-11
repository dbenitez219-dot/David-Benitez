import Link from "next/link";
import { AuthForm, Field } from "@/components/AuthForm";
import { CountrySelect } from "@/components/CountrySelect";
import { PhoneField } from "@/components/PhoneField";
import { listCountries } from "@/lib/countries";
import { getLocale, getT } from "@/lib/locale";
import { PLAN_IDS } from "@/server/billing/plans";
import { registerAction } from "../actions";

export const metadata = { title: "ZENTRA" };

export default async function RegisterPage() {
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const countries = listCountries(locale); // los 240+ países, con nombre en el idioma elegido
  const picker = { search: t("picker.search"), none: t("picker.none") };
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">{t("register.title")}</h1>
      <p className="mb-5 text-sm text-muted">{t("register.trial")}</p>
      <AuthForm action={registerAction} submit={t("register.submit")} pending={t("common.pending")}>
        <Field label={t("register.name")} name="name" autoComplete="name" />
        <Field label={t("register.company")} name="organizationName" autoComplete="organization" />
        <label className="block text-sm"><span className="mb-1 block text-muted">{t("register.country")}</span>
          <CountrySelect name="countryCode" countries={countries} labels={picker} required /></label>
        <PhoneField countries={countries} labels={{ ...picker, number: t("picker.phonePlaceholder") }} label={t("register.phone")} hint={t("register.phoneHint")} />
        <fieldset className="text-sm">
          <legend className="mb-1 text-muted">{t("register.plan")}</legend>
          <div className="space-y-2">
            {PLAN_IDS.map((id) => (
              <label key={id} className="flex items-start gap-2 rounded-lg border border-line p-2.5"><input type="radio" name="planId" value={id} defaultChecked={id === "BUSINESS"} className="mt-1 accent-[#e5202e]" />
                <span><strong>{id[0] + id.slice(1).toLowerCase()}</strong> <span className="text-xs text-muted">— {t(`plan.${id}.desc`)}</span></span></label>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">{t("register.noCard")}</p>
        </fieldset>
        <Field label={t("register.email")} name="email" type="email" autoComplete="email" />
        <Field label={t("register.password")} name="password" type="password" autoComplete="new-password" hint={t("register.passwordHint")} />
      </AuthForm>
      <p className="mt-5 text-center text-sm text-muted">{t("register.haveAccount")} <Link href="/login" className="text-zred">{t("register.login")}</Link></p>
    </>
  );
}
