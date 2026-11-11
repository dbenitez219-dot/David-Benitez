import Link from "next/link";
import { Logo } from "@/components/Logo";
import { PLAN_CATALOG, PLAN_IDS } from "@/server/billing/plans";
import { money } from "@/lib/format";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col px-5">
      <header className="flex items-center justify-between py-5">
        <Logo width={170} />
        <nav className="flex gap-2">
          <Link href="/login" className="btn btn-ghost">Entrar</Link>
          <Link href="/register" className="btn">Probar gratis</Link>
        </nav>
      </header>
      <section className="animate-rise my-auto py-20">
        <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-zred">Global AI Advertising Intelligence</p>
        <h1 className="text-4xl font-bold leading-tight sm:text-6xl">Tu publicidad.<br /><span className="text-zred">Más inteligente.</span></h1>
        <p className="mt-6 max-w-xl text-lg text-muted">
          Analiza tus anuncios, detecta cuáles ganan y cuáles pierden dinero, y decide con datos reales. Para emprendedores, empresas y agencias.
        </p>
        <Link href="/register" className="btn mt-8">Crear mi cuenta</Link>
      </section>
      <section id="planes" className="pb-20">
        <h2 className="text-2xl font-bold">Planes</h2>
        <p className="mb-6 text-sm text-muted">7 días de prueba gratis en todos los planes, sin tarjeta. Precios para Paraguay; otros países tendrán sus propios precios.</p>
        <div className="grid gap-4 md:grid-cols-3">
          {PLAN_IDS.map((id) => { const p = PLAN_CATALOG[id]; return (
            <article key={id} className="card p-5"><h3 className="text-lg font-bold">{p.name}</h3><p className="text-sm text-muted">{p.description}</p>
              <p className="mt-3 text-2xl font-bold">{money(p.prices[0].amountMinor, p.prices[0].currency)}<span className="text-sm font-normal text-muted"> /mes</span></p>
              <ul className="mt-3 space-y-1 text-sm">{p.highlights.map((h) => <li key={h}>✓ {h}</li>)}</ul>
              <Link href="/register" className="btn mt-4 w-full">Probar gratis</Link></article>); })}
        </div>
      </section>
    </main>
  );
}
