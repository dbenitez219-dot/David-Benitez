import Link from "next/link";
import { AuthForm, Field } from "@/components/AuthForm";
import { getT } from "@/lib/locale";
import { forgotPasswordAction } from "../actions";

export const metadata = { title: "ZENTRA" };

export default async function Forgot() {
  const t = await getT();
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">{t("login.forgot")}</h1>
      <p className="mb-5 text-sm text-muted">Escribe tu correo y te enviaremos un enlace para elegir una contraseña nueva.</p>
      <AuthForm action={forgotPasswordAction} submit="Enviar enlace" pending={t("common.pending")}>
        <Field label={t("login.email")} name="email" type="email" autoComplete="email" />
      </AuthForm>
      <p className="mt-5 text-center text-sm text-muted"><Link href="/login" className="text-zred">{t("login.submit")}</Link></p>
    </>
  );
}
