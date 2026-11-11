"use client";
import { startTransition, useActionState } from "react";
import type { FormState } from "@/app/(auth)/actions";

export function AuthForm({ action, submit, pending: pendingLabel = "…", children }: { action: (s: FormState, f: FormData) => Promise<FormState>; submit: string; pending?: string; children: React.ReactNode }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    // onSubmit evita que React 19 vacíe los campos tras un error (la persona no pierde lo que escribió); sin JS sigue funcionando por `action`.
    <form action={formAction} onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => formAction(fd)); }} className="space-y-4">
      {children}
      {state?.ok && <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{state.ok}</p>}
      {state?.error && <p role="alert" className="rounded-lg border border-zred/40 bg-zred/10 px-3 py-2 text-sm text-zred">{state.error}</p>}
      <button className="btn w-full" disabled={pending}>{pending ? pendingLabel : submit}</button>
    </form>
  );
}

export function Field({ label, name, type = "text", autoComplete, hint }: { label: string; name: string; type?: string; autoComplete?: string; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-muted">{label}</span>
      <input className="input" name={name} type={type} autoComplete={autoComplete} required />
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}
