import Link from "next/link";
import { AuthForm, Field } from "@/components/AuthForm";
import { getT } from "@/lib/locale";
import { peekToken } from "@/server/auth/tokens";
import { resetPasswordAction } from "../actions";

export const metadata = { title: "ZENTRA", robots: { index: false } };

export default async function Reset({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const t = await getT();
  const { token = "" } = await searchParams;
  const valid = await peekToken(token, "RESET");
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Nueva contraseña</h1>
      {!valid ? (
        <><p className="my-4 text-sm text-red-300">El enlace no es válido o ya venció.</p><Link href="/forgot-password" className="btn w-full">Solicitar uno nuevo</Link></>
      ) : (
        <AuthForm action={resetPasswordAction} submit="Guardar contraseña" pending={t("common.pending")}>
          <input type="hidden" name="token" value={token} />
          <Field label={t("login.password")} name="password" type="password" autoComplete="new-password" hint={t("register.passwordHint")} />
        </AuthForm>
      )}
    </>
  );
}
