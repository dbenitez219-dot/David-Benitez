import Link from "next/link";
import { AuthForm, Field } from "@/components/AuthForm";
import { getT } from "@/lib/locale";
import { loginAction } from "../actions";

export const metadata = { title: "ZENTRA" };

export default async function LoginPage() {
  const t = await getT();
  return (
    <>
      <h1 className="mb-5 text-xl font-semibold">{t("login.title")}</h1>
      <AuthForm action={loginAction} submit={t("login.submit")} pending={t("common.pending")}>
        <Field label={t("login.email")} name="email" type="email" autoComplete="email" />
        <Field label={t("login.password")} name="password" type="password" autoComplete="current-password" />
      </AuthForm>
      <p className="mt-5 text-center text-sm text-muted">{t("login.noAccount")} <Link href="/register" className="text-zred">{t("login.signup")}</Link></p>
    </>
  );
}
