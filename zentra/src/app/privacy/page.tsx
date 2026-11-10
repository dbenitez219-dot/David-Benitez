import Link from "next/link";
import { Logo } from "@/components/Logo";

export const metadata = { title: "Política de privacidad — ZENTRA" };

// BORRADOR: debe ser revisado por un abogado y completado con los datos legales de la empresa antes de enviarlo a Meta.
export default function Privacy() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-5 py-10 text-sm leading-relaxed text-muted">
      <Link href="/"><Logo width={170} /></Link>
      <p className="rounded-lg border border-zred/40 bg-zred/10 p-3 text-red-200">Borrador: este texto debe ser revisado por un profesional legal y completado con los datos de la empresa antes de publicarse.</p>
      <h1 className="text-2xl font-bold text-white">Política de privacidad</h1>
      <h2 className="font-semibold text-white">Qué datos tratamos</h2>
      <p>Datos de tu cuenta (nombre, correo, país) y, si lo autorizas, datos de tus cuentas publicitarias de Meta: campañas, conjuntos, anuncios y estadísticas de rendimiento.</p>
      <h2 className="font-semibold text-white">Qué no hacemos</h2>
      <p>No guardamos tu contraseña de Facebook. No vendemos tus datos. Los tokens de acceso se almacenan cifrados. Los datos de una organización nunca se muestran a otra.</p>
      <h2 className="font-semibold text-white">Para qué los usamos</h2>
      <p>Para mostrarte análisis, recomendaciones y, solo si tú lo activas, ejecutar acciones autorizadas sobre tus anuncios.</p>
      <h2 className="font-semibold text-white">Tus derechos y eliminación de datos</h2>
      <p>Puedes desconectar Meta en cualquier momento desde «Conexiones», lo que elimina el token de acceso. Puedes pedir la eliminación de tus datos retirando ZENTRA en la configuración de Meta (se procesa automáticamente) o escribiéndonos al correo de contacto [COMPLETAR].</p>
      <h2 className="font-semibold text-white">Contacto</h2>
      <p>[Razón social, dirección y correo de contacto — COMPLETAR]</p>
    </main>
  );
}
