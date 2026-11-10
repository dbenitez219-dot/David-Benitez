import Link from "next/link";
import { AuthForm, Field } from "@/components/AuthForm";
import { loginAction } from "../actions";

export const metadata = { title: "Entrar — ZENTRA" };

export default function LoginPage() {
  return (
    <>
      <h1 className="mb-5 text-xl font-semibold">Entrar a ZENTRA</h1>
      <AuthForm action={loginAction} submit="Entrar">
        <Field label="Correo" name="email" type="email" autoComplete="email" />
        <Field label="Contraseña" name="password" type="password" autoComplete="current-password" />
      </AuthForm>
      <p className="mt-5 text-center text-sm text-muted">¿Sin cuenta? <Link href="/register" className="text-zred">Regístrate</Link></p>
    </>
  );
}
