import Link from "next/link";
import { Logo } from "@/components/Logo";

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
    </main>
  );
}
