import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { getT } from "@/lib/locale";
import { peekToken } from "@/server/auth/tokens";
import { verifyEmailAction } from "../actions";

export const metadata = { title: "ZENTRA", robots: { index: false } };

// La confirmación requiere pulsar un botón (POST): así los antivirus/previsualizadores de correo no "gastan" el enlace.
export default async function Verify({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const t = await getT();
  const { token = "" } = await searchParams;
  const valid = await peekToken(token, "VERIFY");
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">Confirmar correo</h1>
      {!valid ? <p className="mb-4 text-sm text-red-300">El enlace no es válido o ya venció. Puedes pedir otro desde tu cuenta.</p> : (
        <AuthForm action={verifyEmailAction} submit="Confirmar mi correo" pending={t("common.pending")}><input type="hidden" name="token" value={token} /></AuthForm>
      )}
      <Link href="/dashboard" className="btn btn-ghost mt-4 w-full">{t("nav.dashboard")}</Link>
    </>
  );
}
