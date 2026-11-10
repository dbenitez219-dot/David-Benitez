"use client";
import { useActionState } from "react";
import type { SettingsState } from "@/app/(app)/settings/analysis/actions";

type V = { minSpend: number; minDays: number; minImpressions: number; targetCprMessages?: number; targetCprLeads?: number; targetCprSales?: number; maxFrequency: number; anomalyFactor: number };

function F({ label, name, value, hint, step = "any" }: { label: string; name: string; value?: number; hint: string; step?: string }) {
  return (
    <label className="block text-sm"><span className="mb-1 block">{label}</span>
      <input className="input" name={name} type="number" step={step} min="0" defaultValue={value} />
      <span className="mt-1 block text-xs text-muted">{hint}</span></label>
  );
}

export function AnalysisForm({ action, v, currency, canEdit }: { action: (s: SettingsState, f: FormData) => Promise<SettingsState>; v: V; currency: string; canEdit: boolean }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-6">
      <fieldset disabled={!canEdit || pending} className="space-y-6">
        <section className="card grid gap-4 p-5 sm:grid-cols-3">
          <h2 className="font-semibold sm:col-span-3">Cuándo hay datos suficientes para juzgar un anuncio</h2>
          <F label={`Gasto mínimo (${currency})`} name="minSpend" value={v.minSpend} hint="Por debajo de esto no se clasifica." />
          <F label="Días mínimos activo" name="minDays" value={v.minDays} step="1" hint="Evita decidir con 1 o 2 días." />
          <F label="Impresiones mínimas" name="minImpressions" value={v.minImpressions} step="1" hint="Muestra mínima de audiencia." />
        </section>
        <section className="card grid gap-4 p-5 sm:grid-cols-3">
          <div className="sm:col-span-3"><h2 className="font-semibold">Costo máximo aceptable por resultado ({currency})</h2>
            <p className="text-xs text-muted">Opcional. Si lo dejas vacío, ZENTRA compara contra la mediana de tus propios anuncios del mismo objetivo.</p></div>
          <F label="Mensajes" name="targetCprMessages" value={v.targetCprMessages} hint="Costo por mensaje." />
          <F label="Leads" name="targetCprLeads" value={v.targetCprLeads} hint="Costo por lead." />
          <F label="Ventas (compras)" name="targetCprSales" value={v.targetCprSales} hint="Costo por compra." />
        </section>
        <section className="card grid gap-4 p-5 sm:grid-cols-2">
          <h2 className="font-semibold sm:col-span-2">Alertas</h2>
          <F label="Frecuencia máxima" name="maxFrequency" value={v.maxFrequency} hint="Más allá puede haber cansancio del anuncio." />
          <F label="Gasto inusual (veces el promedio)" name="anomalyFactor" value={v.anomalyFactor} hint="Un día que gaste este múltiplo del promedio de 7 días genera alerta." />
        </section>
      </fieldset>
      {state?.error && <p role="alert" className="text-sm text-red-300">{state.error}</p>}
      {state?.saved && <p role="status" className="text-sm text-emerald-300">Guardado. Las clasificaciones se recalculan con estos criterios.</p>}
      {canEdit ? <button className="btn" disabled={pending}>{pending ? "Guardando…" : "Guardar"}</button> : <p className="text-sm text-muted">Solo un administrador puede cambiar estos criterios.</p>}
    </form>
  );
}
