import Link from "next/link";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Logo } from "@/components/Logo";
import { getRegional } from "@/lib/locale";
import { PLAN_CATALOG, PLAN_IDS } from "@/server/billing/plans";

export default async function Home() {
  const { t, fmt } = await getRegional();
  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col px-5">
      <header className="flex flex-wrap items-center justify-between gap-3 py-5">
        <Logo width={170} />
        <nav className="flex flex-wrap items-center gap-2">
          <LanguageSwitcher />
          <Link href="/login" className="btn btn-ghost">{t("landing.login")}</Link>
          <Link href="/register" className="btn">{t("landing.try")}</Link>
        </nav>
      </header>
      <section className="animate-rise my-auto py-20">
        <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-zred">{t("landing.kicker")}</p>
        <h1 className="text-4xl font-bold leading-tight sm:text-6xl">{t("landing.h1a")}<br /><span className="text-zred">{t("landing.h1b")}</span></h1>
        <p className="mt-6 max-w-xl text-lg text-muted">{t("landing.sub")}</p>
        <Link href="/register" className="btn mt-8">{t("landing.cta")}</Link>
      </section>
      <section id="planes" className="pb-20">
        <h2 className="text-2xl font-bold">{t("landing.plans")}</h2>
        <p className="mb-6 text-sm text-muted">{t("landing.plans.sub")}</p>
        <div className="grid gap-4 md:grid-cols-3">
          {PLAN_IDS.map((id) => { const p = PLAN_CATALOG[id]; return (
            <article key={id} className="card p-5"><h3 className="text-lg font-bold">{p.name}</h3><p className="text-sm text-muted">{t(`plan.${id}.desc`)}</p>
              <p className="mt-3 text-2xl font-bold">{fmt.money(p.prices[0].amountMinor, p.prices[0].currency)}<span className="text-sm font-normal text-muted">{t("landing.perMonth")}</span></p>
              <ul className="mt-3 space-y-1 text-sm">{p.highlights.map((_, i) => <li key={i}>✓ {t(`plan.${id}.h${i + 1}`)}</li>)}</ul>
              <Link href="/register" className="btn mt-4 w-full">{t("landing.try")}</Link></article>); })}
        </div>
      </section>
    </main>
  );
}
