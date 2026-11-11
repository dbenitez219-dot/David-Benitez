import Link from "next/link";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Sidebar } from "@/components/Sidebar";
import { db } from "@/lib/db";
import { getT } from "@/lib/locale";
import { getAccess } from "@/server/billing/access";
import { requireOrg } from "@/server/tenancy/context";
import { logoutAction } from "../(auth)/actions";
import { resendVerificationAction } from "./settings/account/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireOrg();
  const t = await getT();
  const access = await getAccess(ctx.organizationId);
  const [demo, unread, stopped] = await Promise.all([
    db.adAccount.count({ where: { organizationId: ctx.organizationId, isDemo: true } }),
    db.notification.count({ where: { organizationId: ctx.organizationId, readAt: null } }),
    db.automationSettings.findUnique({ where: { organizationId: ctx.organizationId }, select: { emergencyStop: true } }),
  ]);
  const labels = Object.fromEntries([...["dashboard", "ads", "connections", "ai", "recommendations", "analysis", "automations", "notifications", "sales", "billing", "regional", "account"].map((k) => [k, t(`nav.${k}`)]), ["menu", t("nav.menu")], ["logout", t("nav.logout")], ["admin", t("nav.admin")]]);
  return (
    <div className="min-h-dvh">
      <Sidebar orgName={ctx.organization.name} userName={ctx.user.name} logout={logoutAction} unread={unread} isAdmin={ctx.user.platformRole === "SUPERADMIN"} labels={labels} footer={<LanguageSwitcher />} />
      <main className="p-5 lg:ml-64 lg:p-8">
        {!ctx.user.emailVerified && <div role="status" className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-panel px-4 py-2 text-sm">{t("banner.verify")}<form action={resendVerificationAction}><button className="text-zred underline">{t("banner.verify.btn")}</button></form></div>}
        {demo > 0 && (
          <div role="status" className="mb-5 rounded-xl border border-zred/50 bg-zred/10 px-4 py-2 text-sm"><strong className="text-zred">{t("banner.demo")}</strong> {t("banner.demo.text")}</div>
        )}
        {access.state === "trial" && <div role="status" className="mb-5 rounded-xl border border-line bg-panel px-4 py-2 text-sm">{t("banner.trial", { days: access.daysLeft ?? 0 })} <Link href="/billing" className="text-zred underline">{t("banner.trial.link")}</Link></div>}
        {access.state === "past_due" && <div role="alert" className="mb-5 rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-2 text-sm">{t("banner.pastDue")} <Link href="/billing" className="underline">{t("banner.pastDue.link")}</Link></div>}
        {(access.state === "expired" || access.state === "none") && <div role="alert" className="mb-5 rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-2 text-sm"><strong>{t("banner.inactive")}</strong> {t("banner.inactive.text")} <Link href="/billing" className="underline">{t("banner.inactive.link")}</Link></div>}
        {stopped?.emergencyStop && (
          <div role="alert" className="mb-5 rounded-xl border border-zred bg-zred/15 px-4 py-2 text-sm text-red-200"><strong>{t("banner.emergency")}</strong> {t("banner.emergency.text")}</div>
        )}
        {children}
      </main>
    </div>
  );
}
