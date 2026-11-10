import Link from "next/link";
import { AuthForm, Field } from "@/components/AuthForm";
import { registerAction } from "../actions";

export const metadata = { title: "Crear cuenta — ZENTRA" };

// Lista inicial. El selector completo con buscador, banderas y teléfonos llega en la Fase 7.
const COUNTRIES: [string, string][] = [
  ["PY", "Paraguay"], ["AR", "Argentina"], ["BR", "Brasil"], ["UY", "Uruguay"], ["CL", "Chile"], ["BO", "Bolivia"],
  ["PE", "Perú"], ["CO", "Colombia"], ["EC", "Ecuador"], ["VE", "Venezuela"], ["MX", "México"], ["ES", "España"],
  ["US", "Estados Unidos"], ["PT", "Portugal"], ["OTHER", "Otro"],
];

export default function RegisterPage() {
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Crea tu cuenta</h1>
      <p className="mb-5 text-sm text-muted">7 días de prueba gratis. Sin tarjeta.</p>
      <AuthForm action={registerAction} submit="Crear cuenta">
        <Field label="Tu nombre" name="name" autoComplete="name" />
        <Field label="Empresa o marca" name="organizationName" autoComplete="organization" />
        <label className="block text-sm">
          <span className="mb-1 block text-muted">País</span>
          <select className="input" name="countryCode" defaultValue="PY">
            {COUNTRIES.map(([c, n]) => <option key={c} value={c === "OTHER" ? "" : c}>{n}</option>)}
          </select>
        </label>
        <Field label="Correo" name="email" type="email" autoComplete="email" />
        <Field label="Contraseña" name="password" type="password" autoComplete="new-password" hint="Mínimo 10 caracteres, con mayúscula, minúscula y número." />
      </AuthForm>
      <p className="mt-5 text-center text-sm text-muted">¿Ya tienes cuenta? <Link href="/login" className="text-zred">Entrar</Link></p>
    </>
  );
}
