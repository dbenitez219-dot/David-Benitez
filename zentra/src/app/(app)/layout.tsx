import { Sidebar } from "@/components/Sidebar";
import { db } from "@/lib/db";
import { requireOrg } from "@/server/tenancy/context";
import { logoutAction } from "../(auth)/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireOrg();
  const demo = await db.adAccount.count({ where: { organizationId: ctx.organizationId, isDemo: true } });
  return (
    <div className="min-h-dvh">
      <Sidebar orgName={ctx.organization.name} userName={ctx.user.name} logout={logoutAction} />
      <main className="p-5 lg:ml-64 lg:p-8">
        {demo > 0 && (
          <div role="status" className="mb-5 rounded-xl border border-zred/50 bg-zred/10 px-4 py-2 text-sm">
            <strong className="text-zred">DATOS DE DEMOSTRACIÓN.</strong> Las cifras que ves son ficticias y no corresponden a ninguna cuenta real.
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
