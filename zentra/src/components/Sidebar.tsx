"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Logo } from "./Logo";

export type NavLabels = Record<string, string>;
const NAV = [
  ["dashboard", "/dashboard"], ["ads", "/ads"], ["connections", "/connections"], ["ai", "/assistant"], ["recommendations", "/recommendations"],
  ["analysis", "/settings/analysis"], ["automations", "/automations"], ["notifications", "/notifications"], ["sales", "/sales"], ["billing", "/billing"], ["regional", "/settings/regional"],
] as const;

export function Sidebar({ orgName, userName, logout, unread = 0, isAdmin = false, labels, footer }: {
  orgName: string; userName: string; logout: () => Promise<void>; unread?: number; isAdmin?: boolean; labels: NavLabels; footer?: React.ReactNode;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="flex items-center justify-between border-b border-line px-4 py-3 lg:hidden">
        <Logo width={150} />
        <button className="btn btn-ghost" aria-expanded={open} aria-label={labels.menu} onClick={() => setOpen(!open)}>☰</button>
      </div>
      <aside className={`${open ? "block" : "hidden"} overflow-y-auto border-b border-line bg-panel p-4 lg:fixed lg:inset-y-0 lg:block lg:w-64 lg:border-b-0 lg:border-r`}>
        <div className="mb-6 hidden lg:block"><Logo width={200} /></div>
        <p className="mb-4 truncate text-xs uppercase tracking-wider text-muted">{orgName}</p>
        <nav className="space-y-1">
          {NAV.map(([key, href]) => {
            const active = path === href || path.startsWith(href + "/");
            return (
              <Link key={key} href={href} onClick={() => setOpen(false)} className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${active ? "bg-zred/15 text-white" : "text-muted hover:text-white"}`}>
                {labels[key]}{key === "notifications" && unread > 0 && <span className="rounded-full bg-zred px-2 text-xs font-semibold text-white">{unread}</span>}
              </Link>
            );
          })}
        </nav>
        {isAdmin && <Link href="/admin" className="mt-4 block rounded-lg border border-zred/40 px-3 py-2 text-sm text-red-300 hover:bg-zred/10">{labels.admin}</Link>}
        <div className="mt-8 space-y-3 border-t border-line pt-4 text-sm">
          {footer}
          <p className="truncate text-muted">{userName}</p>
          <form action={logout}><button className="btn btn-ghost w-full">{labels.logout}</button></form>
        </div>
      </aside>
    </>
  );
}
