import { Sidebar } from "@/components/Sidebar";
import { db } from "@/lib/db";
import { requireOrg } from "@/server/tenancy/context";
import { getAccess } from "@/server/billing/access";
import Link from "next/link";
import { logoutAction } from "../(auth)/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireOrg();
  const access = await getAccess(ctx.organizationId);
  const [demo, unread, stopped] = await Promise.all([
    db.adAccount.count({ where: { organizationId: ctx.organizationId, isDemo: true } }),
    db.notification.count({ where: { organizationId: ctx.organizationId, readAt: null } }),
    db.automationSettings.findUnique({ where: { organizationId: ctx.organizationId }, select: { emergencyStop: true } }),
  ]);
  return (
    <div className="min-h-dvh">
      <Sidebar orgName={ctx.organization.name} userName={ctx.user.name} logout={logoutAction} unread={unread} isAdmin={ctx.user.platformRole === "SUPERADMIN"} />
      <main className="p-5 lg:ml-64 lg:p-8">
        {demo > 0 && (
          <div role="status" className="mb-5 rounded-xl border border-zred/50 bg-zred/10 px-4 py-2 text-sm">
            <strong className="text-zred">DATOS DE DEMOSTRACIÓN.</strong> Las cifras que ves son ficticias y no corresponden a ninguna cuenta real.
          </div>
        )}
        {access.state === "trial" && <div role="status" className="mb-5 rounded-xl border border-line bg-panel px-4 py-2 text-sm">Prueba gratuita: te quedan <strong>{access.daysLeft} día(s)</strong>. No se cobra nada automáticamente. <Link href="/billing" className="text-zred underline">Ver planes</Link></div>}
        {access.state === "past_due" && <div role="alert" className="mb-5 rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-2 text-sm">No pudimos cobrar tu renovación; seguimos reintentando. <Link href="/billing" className="underline">Revisar pago</Link></div>}
        {(access.state === "expired" || access.state === "none") && <div role="alert" className="mb-5 rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-2 text-sm"><strong>Tu suscripción no está activa.</strong> Tus datos están a salvo; las funciones premium (sincronización, automatizaciones, IA, ventas) están limitadas. <Link href="/billing" className="underline">Activar plan</Link></div>}
        {stopped?.emergencyStop && (
          <div role="alert" className="mb-5 rounded-xl border border-zred bg-zred/15 px-4 py-2 text-sm text-red-200"><strong>BOTÓN DE EMERGENCIA ACTIVADO.</strong> ZENTRA no escribirá nada en tus cuentas publicitarias.</div>
        )}
        {children}
      </main>
    </div>
  );
}
