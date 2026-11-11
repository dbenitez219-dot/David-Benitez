import { ActionForm } from "@/components/ActionForm";
import { db } from "@/lib/db";
import { requireOrg } from "@/server/tenancy/context";
import { changePasswordAction, deleteAccountAction, resendVerificationAction, signOutEverywhereAction } from "./actions";

export const metadata = { title: "ZENTRA" };

export default async function Account({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const ctx = await requireOrg();
  const { msg } = await searchParams;
  const owned = await db.membership.findMany({ where: { userId: ctx.user.id, role: "OWNER" }, include: { organization: { select: { id: true, name: true } } } });
  const soleOwned: string[] = [];
  for (const m of owned) if ((await db.membership.count({ where: { organizationId: m.organizationId, role: "OWNER", userId: { not: ctx.user.id } } })) === 0) soleOwned.push(m.organization.name);
  const field = (label: string, name: string, type = "password", ac = "off") => <label className="block text-sm"><span className="mb-1 block text-muted">{label}</span><input className="input" name={name} type={type} autoComplete={ac} required /></label>;
  return (
    <div className="animate-rise max-w-2xl space-y-6">
      <div><h1 className="text-2xl font-bold">Cuenta y seguridad</h1><p className="text-sm text-muted">{ctx.user.email}</p></div>
      {msg && <p role="status" className="rounded-xl border border-line bg-panel px-4 py-2 text-sm">{msg}</p>}

      <section className="card p-5"><h2 className="mb-1 font-semibold">Correo electrónico</h2>
        {ctx.user.emailVerified ? <p className="text-sm text-emerald-300">✓ Confirmado</p> : (
          <div className="flex flex-wrap items-center gap-3 text-sm"><span className="text-amber-300">Sin confirmar</span>
            <form action={resendVerificationAction}><button className="btn btn-ghost !py-1.5 text-sm">Enviar enlace de confirmación</button></form></div>)}
      </section>

      <section className="card p-5"><h2 className="mb-3 font-semibold">Cambiar contraseña</h2>
        <ActionForm action={changePasswordAction} submit="Cambiar contraseña">
          {field("Contraseña actual", "current", "password", "current-password")}{field("Contraseña nueva (mín. 10, con mayúscula, minúscula y número)", "next", "password", "new-password")}
        </ActionForm></section>

      <section className="card p-5"><h2 className="mb-1 font-semibold">Sesiones</h2>
        <p className="mb-3 text-sm text-muted">Si usaste ZENTRA en un equipo ajeno o sospechas de un acceso, cierra las sesiones de tus otros dispositivos.</p>
        <form action={signOutEverywhereAction}><button className="btn btn-ghost !py-1.5 text-sm">Cerrar sesión en otros dispositivos</button></form></section>

      <section className="card p-5"><h2 className="mb-1 font-semibold">Tus datos</h2>
        <p className="mb-3 text-sm text-muted">Descarga una copia de tus datos (perfil, y los datos de las organizaciones que administras) en un archivo JSON. No incluye contraseñas ni credenciales.</p>
        <a href="/api/account/export" className="btn btn-ghost inline-flex !py-1.5 text-sm">Descargar mis datos</a></section>

      <section className="card border-zred/40 p-5"><h2 className="mb-1 font-semibold text-red-300">Eliminar mi cuenta</h2>
        <p className="mb-3 text-sm text-muted">Es permanente. {soleOwned.length > 0 ? <>Como eres la única persona propietaria de <strong className="text-white">{soleOwned.join(", ")}</strong>, <strong className="text-white">también se eliminará esa organización con todos sus datos</strong> (para todos sus miembros).</> : "Saldrás de tus organizaciones; sus datos se conservan para los demás miembros."} Revocamos el permiso de Meta. Los registros de auditoría se anonimizan.</p>
        <ActionForm action={deleteAccountAction} submit="Eliminar definitivamente">
          {field(`Escribe tu correo (${ctx.user.email}) para confirmar`, "confirm", "text", "off")}{field("Tu contraseña", "password", "password", "current-password")}
        </ActionForm></section>
    </div>
  );
}
