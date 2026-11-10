import { Sidebar } from "@/components/Sidebar";
import { requireOrg } from "@/server/tenancy/context";
import { logoutAction } from "../(auth)/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireOrg();
  return (
    <div className="min-h-dvh">
      <Sidebar orgName={ctx.organization.name} userName={ctx.user.name} logout={logoutAction} />
      <main className="p-5 lg:ml-64 lg:p-8">{children}</main>
    </div>
  );
}
