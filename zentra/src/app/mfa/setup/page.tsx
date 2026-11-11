import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { CodeForm } from "@/components/MfaForms";
import { decryptSecret } from "@/lib/crypto";
import { getSession } from "@/server/auth/session";
import { beginTotpSetup, otpauthUri } from "@/server/auth/totp";
import { confirmSetupAction } from "../actions";

export default async function Setup() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.user.platformRole !== "SUPERADMIN") redirect("/dashboard");
  if (s.user.totpEnabledAt) redirect("/mfa/verify");
  // Si ya hay un secreto pendiente se reutiliza (recargar la página no invalida lo que ya escaneaste).
  const secret = s.user.totpSecretEnc ? decryptSecret(s.user.totpSecretEnc) : await beginTotpSetup(s.userId);
  const uri = otpauthUri(s.user.email, secret);
  const svg = await QRCode.toString(uri, { type: "svg", margin: 1, color: { dark: "#000000", light: "#ffffff" } });
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Activa la verificación en dos pasos</h1>
      <p className="text-sm text-muted">Como propietario de ZENTRA es obligatoria. Escanea el código con una app como Google Authenticator, Microsoft Authenticator o Authy, y escribe el código de 6 dígitos.</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`} alt="Código QR para la app de autenticación" width={200} height={200} className="mx-auto rounded-lg bg-white p-1" />
      <p className="break-all text-center text-xs text-muted">¿No puedes escanear? Clave manual: <code className="text-white">{secret}</code></p>
      <CodeForm action={confirmSetupAction} button="Activar" />
    </div>
  );
}
