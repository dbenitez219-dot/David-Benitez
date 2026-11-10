"use client";
import { useActionState } from "react";
import type { AskState } from "@/app/(app)/assistant/actions";

export function AskForm({ action, suggestions }: { action: (s: AskState, f: FormData) => Promise<AskState>; suggestions: string[] }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-3">
      <div className="flex gap-2">
        <input name="question" required maxLength={500} placeholder="Pregunta sobre tus anuncios…" className="input" aria-label="Tu pregunta" />
        <button className="btn" disabled={pending}>{pending ? "Analizando…" : "Preguntar"}</button>
      </div>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button key={s} name="question" value={s} disabled={pending} formNoValidate className="rounded-full border border-line px-3 py-1 text-xs text-muted hover:border-zred hover:text-white disabled:opacity-50">{s}</button>
        ))}
      </div>
      {state?.error && <p role="alert" className="text-sm text-red-300">{state.error}</p>}
    </form>
  );
}
