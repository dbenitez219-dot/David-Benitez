import { db } from "@/lib/db";
import { getFormatter } from "@/lib/locale";
import { hasRole, requireOrg } from "@/server/tenancy/context";
import { parseRules } from "@/server/automation/rules";
import { ActionForm } from "@/components/ActionForm";
import { approveActionAction, createRuleAction, deleteRuleAction, emergencyAction, evaluateNowAction, rejectActionAction, resumeAction, saveSettingsAction, toggleRuleAction } from "./actions";

export const metadata = { title: "Automatizaciones — ZENTRA" };

const MODES = [
  ["MANUAL", "Manual", "Analiza y recomienda. No propone ni ejecuta cambios."],
  ["ASSISTED", "Asistida", "Propone acciones y espera tu autorización una por una."],
  ["AUTOMATIC", "Automática", "Ejecuta las acciones de tus reglas sin preguntar (si pasan todas las verificaciones)."],
] as const;
const STATUS: Record<string, [string, string]> = {
  PROPOSED: ["Pendiente", "text-amber-300"], APPROVED: ["Aprobada", "text-sky-300"], EXECUTING: ["En curso", "text-sky-300"], EXECUTED: ["Ejecutada", "text-emerald-300"],
  FAILED: ["Falló", "text-red-300"], REJECTED: ["Rechazada", "text-muted"], SIMULATED: ["Simulada", "text-violet-300"],
};
const TYPE: Record<string, string> = { PAUSE: "Pausar", RESUME: "Reactivar" };
const Check = ({ name, label, checked, disabled }: { name: string; label: string; checked: boolean; disabled?: boolean }) => (
  <label className="flex items-start gap-2 text-sm"><input type="checkbox" name={name} defaultChecked={checked} disabled={disabled} className="mt-1 accent-[#e5202e]" /><span>{label}</span></label>
);
const NumField = ({ name, label, value, hint, step = "any" }: { name: string; label: string; value?: number; hint?: string; step?: string }) => (
  <label className="block text-sm"><span className="mb-1 block">{label}</span><input className="input" name={name} type="number" step={step} min="0" defaultValue={value} required />{hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}</label>
);

export default async function Automations({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const ctx = await requireOrg();
  const { dateLocal: dateLong, money } = await getFormatter();
  const { msg } = await searchParams;
  const admin = hasRole(ctx.role, "ADMIN");
  const cur = ctx.organization.currency, org = ctx.organizationId;
  const [s, rulesRaw, actions, accounts, pausedAds, campaigns] = await Promise.all([
    db.automationSettings.findUnique({ where: { organizationId: org } }),
    db.automationRule.findMany({ where: { organizationId: org }, orderBy: { createdAt: "desc" } }),
    db.automationAction.findMany({ where: { organizationId: org }, orderBy: { createdAt: "desc" }, take: 40 }),
    db.adAccount.findMany({ where: { organizationId: org, platform: "META", isDemo: false }, select: { id: true, name: true, canManage: true, status: true } }),
    db.ad.findMany({ where: { organizationId: org, status: "PAUSED" }, select: { id: true, name: true }, take: 20, orderBy: { name: "asc" } }),
    db.campaign.findMany({ where: { organizationId: org }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const st = s ?? { mode: "MANUAL", enabled: false, dryRun: true, emergencyStop: false, maxActionsPerDay: 5, activeFromHour: 0, activeToHour: 24, notifyEmail: false };
  const rules = parseRules(rulesRaw);
  const pending = actions.filter((a) => a.status === "PROPOSED");
  const real = st.enabled && st.mode === "AUTOMATIC" && !st.dryRun;
  const status = st.emergencyStop ? ["EMERGENCIA: todo detenido", "border-zred bg-zred/15 text-red-200"]
    : !st.enabled ? ["Automatizaciones desactivadas", "border-line bg-panel text-muted"]
    : st.dryRun ? ["Activas en modo simulación (no se toca ninguna cuenta real)", "border-violet-500/40 bg-violet-500/10"]
    : real ? ["Automático REAL activo", "border-amber-500/50 bg-amber-500/10 text-amber-200"] : ["Activas: requieren tu aprobación", "border-emerald-500/30 bg-emerald-500/10"];

  return (
    <div className="animate-rise max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Automatizaciones</h1>
        <p className="text-sm text-muted">Tú decides cuánto delega ZENTRA. Todo queda registrado: motivo, estado anterior y resultado.</p>
      </div>
      {msg && <p role="status" className="rounded-xl border border-line bg-panel px-4 py-2 text-sm">{msg}</p>}
      <p className={`rounded-xl border px-4 py-3 text-sm font-medium ${status[1]}`}>{status[0]}</p>

      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-semibold">Botón de emergencia</h2><p className="text-sm text-muted">Detiene de inmediato toda escritura en Meta (automática y por aprobación).</p></div>
          {admin && <form action={emergencyAction}><input type="hidden" name="on" value={st.emergencyStop ? "0" : "1"} />
            <button className={st.emergencyStop ? "btn btn-ghost" : "btn"}>{st.emergencyStop ? "Reanudar automatizaciones" : "⛔ DETENER TODO"}</button></form>}
        </div>
      </section>

      <section className="card p-5">
        <h2 className="mb-2 font-semibold">Permiso de gestión en Meta</h2>
        <p className="mb-3 text-sm text-muted">Para pausar o reactivar anuncios, Meta debe haberte concedido el permiso <code>ads_management</code>. Por defecto ZENTRA solo pide lectura.</p>
        {accounts.length === 0 ? <p className="text-sm text-muted">No hay cuentas de Meta conectadas. Conéctalas en Conexiones.</p> : (
          <ul className="space-y-1 text-sm">{accounts.map((a) => <li key={a.id}>{a.canManage ? "✅" : "⚪"} {a.name} — {a.canManage ? "gestión autorizada" : "solo lectura"}</li>)}</ul>
        )}
        {admin && accounts.length > 0 && <a href="/api/meta/connect?manage=1" className="btn btn-ghost mt-3 inline-flex !py-1.5 text-sm">Autorizar gestión de anuncios en Meta</a>}
      </section>

      <section className="card p-5">
        <h2 className="mb-3 font-semibold">Configuración</h2>
        {admin ? (
          <ActionForm action={saveSettingsAction} submit="Guardar configuración">
            <div className="space-y-2">
              {MODES.map(([v, l, d]) => (
                <label key={v} className="flex items-start gap-2 text-sm"><input type="radio" name="mode" value={v} defaultChecked={st.mode === v} className="mt-1 accent-[#e5202e]" /><span><strong>{l}</strong> — <span className="text-muted">{d}</span></span></label>
              ))}
            </div>
            <Check name="enabled" label="Activar automatizaciones (si está apagado, ZENTRA solo analiza y avisa)" checked={st.enabled} />
            <Check name="dryRun" label="Modo simulación: registra lo que haría, pero NO cambia nada en las cuentas reales (recomendado al empezar)" checked={st.dryRun} />
            <div className="grid gap-3 sm:grid-cols-3">
              <NumField name="maxActionsPerDay" label="Máx. acciones por día" value={st.maxActionsPerDay} step="1" hint="En ventana de 24 h." />
              <NumField name="activeFromHour" label="Desde la hora" value={st.activeFromHour} step="1" hint="0–23, hora de tu organización." />
              <NumField name="activeToHour" label="Hasta la hora" value={st.activeToHour} step="1" hint="1–24." />
            </div>
            <Check name="notifyEmail" label="Enviarme por correo los avisos importantes" checked={st.notifyEmail} />
            <label className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm"><input type="checkbox" name="confirmReal" className="mt-1 accent-[#e5202e]" />
              <span>Entiendo que si activo el modo <strong>automático</strong> sin simulación, ZENTRA pausará anuncios reales sin pedirme permiso cada vez.</span></label>
          </ActionForm>
        ) : <p className="text-sm text-muted">Modo: {MODES.find((m) => m[0] === st.mode)?.[1]} · {st.enabled ? "activas" : "desactivadas"}. Solo un administrador puede cambiar la configuración.</p>}
      </section>

      <section className="card p-5">
        <h2 className="mb-1 font-semibold">Reglas</h2>
        <p className="mb-3 text-xs text-muted">Si varias reglas aplican a un anuncio, gana la más específica (anuncio, conjunto, campaña, cuenta). Nunca se aumentan presupuestos automáticamente.</p>
        {rules.length === 0 ? <p className="mb-3 text-sm text-muted">Todavía no hay reglas.</p> : (
          <ul className="mb-4 divide-y divide-line">
            {rulesRaw.map((r) => {
              const p = rules.find((x) => x.id === r.id);
              const c = (p?.config ?? r.config) as any;
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <div><span className="font-medium">{r.name}</span> <span className="text-xs text-muted">· {r.scope === "ACCOUNT" ? "toda la cuenta" : `${r.scope.toLowerCase()}`} · {r.enabled ? "activa" : "apagada"}</span>
                    <p className="text-xs text-muted">{c.kind === "BUDGET_ALERT" ? `Avisar si el gasto diario supera ${money(c.maxDailyBudget, cur)}` : `Pausar si cuesta más de ${money(c.maxCostPerResult, cur)} por resultado, tras ${money(c.minSpend, cur)} y ${c.minObservationDays} días (mín. ${c.minConversions} resultado/s)`}</p></div>
                  {admin && <div className="flex gap-2">
                    <form action={toggleRuleAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="enabled" value={r.enabled ? "0" : "1"} /><button className="btn btn-ghost !py-1 text-xs">{r.enabled ? "Apagar" : "Encender"}</button></form>
                    <form action={deleteRuleAction}><input type="hidden" name="id" value={r.id} /><button className="btn btn-ghost !py-1 text-xs">Borrar</button></form></div>}
                </li>
              );
            })}
          </ul>
        )}
        {admin && (
          <details className="rounded-lg border border-line p-3">
            <summary className="cursor-pointer text-sm font-medium">Crear una regla</summary>
            <ActionForm action={createRuleAction} submit="Crear regla" className="mt-3 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm"><span className="mb-1 block">Nombre</span><input className="input" name="name" required minLength={2} maxLength={80} /></label>
                <label className="block text-sm"><span className="mb-1 block">Tipo</span><select className="input" name="kind"><option value="PAUSE">Pausar anuncios caros o sin resultados</option><option value="BUDGET_ALERT">Avisar si se supera un presupuesto diario</option></select></label>
                <label className="block text-sm"><span className="mb-1 block">Aplica a</span><select className="input" name="scope"><option value="ACCOUNT">Toda la cuenta</option><option value="CAMPAIGN">Una campaña</option></select></label>
                <label className="block text-sm"><span className="mb-1 block">Campaña (si aplica)</span><select className="input" name="scopeId"><option value="">—</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              </div>
              <p className="text-xs text-muted">Completa los campos del tipo elegido (los demás se ignoran).</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm"><span className="mb-1 block">Costo máximo por resultado ({cur})</span><input className="input" name="maxCostPerResult" type="number" step="any" min="0" /></label>
                <label className="block text-sm"><span className="mb-1 block">Gasto mínimo antes de evaluar ({cur})</span><input className="input" name="minSpend" type="number" step="any" min="0" /></label>
                <label className="block text-sm"><span className="mb-1 block">Días mínimos de observación</span><input className="input" name="minObservationDays" type="number" step="1" min="1" defaultValue={5} /></label>
                <label className="block text-sm"><span className="mb-1 block">Resultados mínimos para juzgar el costo</span><input className="input" name="minConversions" type="number" step="1" min="1" defaultValue={1} /></label>
                <label className="block text-sm"><span className="mb-1 block">Presupuesto diario máximo ({cur}) — solo para avisos</span><input className="input" name="maxDailyBudget" type="number" step="any" min="0" /></label>
              </div>
            </ActionForm>
          </details>
        )}
        {admin && <form action={evaluateNowAction} className="mt-3"><button className="btn btn-ghost !py-1.5 text-sm">Evaluar ahora</button></form>}
      </section>

      <section className="card p-5">
        <h2 className="mb-3 font-semibold">Esperan tu decisión ({pending.length})</h2>
        {pending.length === 0 ? <p className="text-sm text-muted">No hay acciones pendientes.</p> : (
          <ul className="space-y-3">{pending.map((a) => (
            <li key={a.id} className="rounded-lg border border-line p-3 text-sm">
              <p className="font-medium">{TYPE[a.type] ?? a.type} anuncio <span className="font-mono text-xs text-muted">{a.adExternalId}</span></p>
              <p className="mt-1">{a.reason}</p>
              {a.note && <p className="mt-1 text-xs text-amber-300">⚠ {a.note}</p>}
              {admin && <div className="mt-2 flex gap-2">
                <form action={approveActionAction}><input type="hidden" name="id" value={a.id} /><button className="btn !py-1.5 text-sm">Aprobar</button></form>
                <form action={rejectActionAction}><input type="hidden" name="id" value={a.id} /><button className="btn btn-ghost !py-1.5 text-sm">Rechazar</button></form></div>}
            </li>))}</ul>
        )}
      </section>

      {admin && pausedAds.length > 0 && (
        <section className="card p-5">
          <h2 className="mb-1 font-semibold">Anuncios pausados</h2>
          <p className="mb-3 text-xs text-muted">Reactivar siempre lo decides tú; ZENTRA nunca reactiva por su cuenta.</p>
          <ul className="divide-y divide-line">{pausedAds.map((a) => (
            <li key={a.id} className="flex items-center justify-between py-2 text-sm"><span>{a.name}</span>
              <form action={resumeAction}><input type="hidden" name="id" value={a.id} /><button className="btn btn-ghost !py-1 text-xs">Reactivar</button></form></li>))}</ul>
        </section>
      )}

      <section className="card p-5">
        <h2 className="mb-3 font-semibold">Registro de decisiones</h2>
        {actions.length === 0 ? <p className="text-sm text-muted">Sin movimientos todavía.</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-xs">
            <thead className="text-muted"><tr><th className="py-2 pr-3 font-normal">Fecha</th><th className="pr-3 font-normal">Acción</th><th className="pr-3 font-normal">Estado</th><th className="pr-3 font-normal">Motivo</th><th className="font-normal">Estado anterior / resultado</th></tr></thead>
            <tbody>{actions.map((a) => {
              const [label, color] = STATUS[a.status] ?? [a.status, ""];
              const prev = (a.previousState as any)?.status;
              const res = a.result as any;
              return (
                <tr key={a.id} className="border-t border-line align-top">
                  <td className="py-2 pr-3 whitespace-nowrap">{dateLong(a.createdAt)}</td>
                  <td className="pr-3">{TYPE[a.type] ?? a.type}<br /><span className="font-mono text-muted">{a.adExternalId}</span><br /><span className="text-muted">{a.source === "USER" ? "por una persona" : "por regla"}</span></td>
                  <td className={`pr-3 ${color}`}>{label}</td>
                  <td className="pr-3">{a.reason}{a.note && <><br /><span className="text-amber-300">{a.note}</span></>}</td>
                  <td>{prev ? `Antes: ${prev}` : "—"}{res?.newStatus && <><br />Ahora: {res.newStatus}</>}{res?.error && <><br /><span className="text-red-300">{String(res.error)}</span></>}</td>
                </tr>);
            })}</tbody></table></div>
        )}
      </section>
    </div>
  );
}
