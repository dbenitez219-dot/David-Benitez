import { redirect } from "next/navigation";
import { CodeForm } from "@/components/MfaForms";
import { getSession } from "@/server/auth/session";
import { isMfaFresh } from "@/server/auth/totp";
import { verifyMfaAction } from "../actions";

export default async function Verify() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.user.platformRole !== "SUPERADMIN") redirect("/dashboard");
  if (!s.user.totpEnabledAt) redirect("/mfa/setup");
  if (isMfaFresh(s.mfaVerifiedAt)) redirect("/admin");
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Verificación en dos pasos</h1>
      <p className="text-sm text-muted">Escribe el código de 6 dígitos de tu app de autenticación (o un código de recuperación).</p>
      <CodeForm action={verifyMfaAction} button="Verificar" placeholder="123456" mode="text" />
    </div>
  );
}
