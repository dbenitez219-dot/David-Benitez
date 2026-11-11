"use client";
import { startTransition, useActionState } from "react";

export type FormMsg = { error?: string; ok?: string } | undefined;

/** Formulario genérico con mensaje de error/éxito para server actions. */
export function ActionForm({ action, submit, children, className = "space-y-4" }: { action: (s: FormMsg, f: FormData) => Promise<FormMsg>; submit: string; children: React.ReactNode; className?: string }) {
  const [state, fa, pending] = useActionState(action, undefined);
  return (
    <form action={fa} onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => fa(fd)); }} className={className}>
      {children}
      {state?.error && <p role="alert" className="text-sm text-red-300">{state.error}</p>}
      {state?.ok && <p role="status" className="text-sm text-emerald-300">{state.ok}</p>}
      <button className="btn" disabled={pending}>{pending ? "Guardando…" : submit}</button>
    </form>
  );
}
