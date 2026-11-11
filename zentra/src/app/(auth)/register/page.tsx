import Link from "next/link";
import { AuthForm, Field } from "@/components/AuthForm";
import { registerAction } from "../actions";
import { PLAN_CATALOG, PLAN_IDS } from "@/server/billing/plans";

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
        <fieldset className="text-sm">
          <legend className="mb-1 text-muted">Plan para tu prueba gratis de 7 días</legend>
          <div className="space-y-2">
            {PLAN_IDS.map((id) => (
              <label key={id} className="flex items-start gap-2 rounded-lg border border-line p-2.5"><input type="radio" name="planId" value={id} defaultChecked={id === "BUSINESS"} className="mt-1 accent-[#e5202e]" />
                <span><strong>{PLAN_CATALOG[id].name}</strong> <span className="text-xs text-muted">— {PLAN_CATALOG[id].description}</span></span></label>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">No pedimos tarjeta. No se cobra nada al terminar la prueba.</p>
        </fieldset>
        <Field label="Correo" name="email" type="email" autoComplete="email" />
        <Field label="Contraseña" name="password" type="password" autoComplete="new-password" hint="Mínimo 10 caracteres, con mayúscula, minúscula y número." />
      </AuthForm>
      <p className="mt-5 text-center text-sm text-muted">¿Ya tienes cuenta? <Link href="/login" className="text-zred">Entrar</Link></p>
    </>
  );
}
