"use client";
import { useActionState } from "react";
import type { FormState } from "@/app/(auth)/actions";

export function AuthForm({ action, submit, children }: { action: (s: FormState, f: FormData) => Promise<FormState>; submit: string; children: React.ReactNode }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-4">
      {children}
      {state?.error && <p role="alert" className="rounded-lg border border-zred/40 bg-zred/10 px-3 py-2 text-sm text-zred">{state.error}</p>}
      <button className="btn w-full" disabled={pending}>{pending ? "Un momento…" : submit}</button>
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
