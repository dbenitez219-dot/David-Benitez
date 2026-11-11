"use client";
import Link from "next/link";
import { startTransition, useActionState } from "react";
import type { MfaState } from "@/app/mfa/actions";

type A = (s: MfaState, f: FormData) => Promise<MfaState>;
const submit = (fa: (f: FormData) => void) => (e: React.FormEvent<HTMLFormElement>) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => fa(fd)); };

export function CodeForm({ action, button, placeholder = "123456", mode = "numeric" }: { action: A; button: string; placeholder?: string; mode?: "numeric" | "text" }) {
  const [st, fa, pending] = useActionState(action, undefined);
  if (st?.codes) return (
    <div className="space-y-3">
      <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">Verificación en dos pasos activada.</p>
      <p className="text-sm"><strong>Guarda estos códigos de recuperación ahora.</strong> Se muestran una sola vez; cada uno sirve una vez si pierdes tu teléfono.</p>
      <ul className="grid grid-cols-2 gap-2 font-mono text-sm">{st.codes.map((c) => <li key={c} className="rounded border border-line bg-ink px-2 py-1">{c}</li>)}</ul>
      <Link href="/admin" className="btn w-full">Ir al panel</Link>
    </div>
  );
  return (
    <form action={fa} onSubmit={submit(fa)} className="space-y-3">
      <input name="code" autoFocus required autoComplete="one-time-code" inputMode={mode} placeholder={placeholder} maxLength={32} className="input text-center text-lg tracking-widest" />
      {st?.error && <p role="alert" className="text-sm text-red-300">{st.error}</p>}
      <button className="btn w-full" disabled={pending}>{pending ? "…" : button}</button>
    </form>
  );
}
