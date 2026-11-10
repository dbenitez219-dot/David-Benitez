"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { evaluateOrganization } from "@/server/automation/engine";
import { approveAction, createRule, deleteRule, rejectAction, requestResume, saveSettings, ServiceError, setEmergencyStop, setRuleEnabled, settingsSchema } from "@/server/automation/service";
import { requireOrg } from "@/server/tenancy/context";
import type { FormMsg } from "@/components/ActionForm";

const msg = (m: string) => redirect(`/automations?msg=${encodeURIComponent(m.slice(0, 300))}`);
const done = () => revalidatePath("/", "layout");
const num = (v: FormDataEntryValue | null) => (v === null || v === "" ? undefined : Number(v));

/** Ejecuta una operación de servicio mostrando sus errores de negocio como mensaje. */
async function guarded(fn: () => Promise<string | void>): Promise<never> {
  let m = "Listo.";
  try { m = (await fn()) || m; } catch (e) { m = e instanceof ServiceError ? e.message : "No se pudo completar la operación."; if (!(e instanceof ServiceError)) console.error(e); }
  done(); return msg(m);
}

export async function saveSettingsAction(_: FormMsg, fd: FormData): Promise<FormMsg> {
  const ctx = await requireOrg("ADMIN");
  const p = settingsSchema.safeParse({
    mode: fd.get("mode"), enabled: fd.get("enabled") === "on", dryRun: fd.get("dryRun") === "on", notifyEmail: fd.get("notifyEmail") === "on", confirmReal: fd.get("confirmReal") === "on",
    maxActionsPerDay: fd.get("maxActionsPerDay"), activeFromHour: fd.get("activeFromHour"), activeToHour: fd.get("activeToHour"),
  });
  if (!p.success) return { error: "Revisa los valores del formulario." };
  try { await saveSettings({ organizationId: ctx.organizationId, userId: ctx.user.id }, p.data); } catch (e) { if (e instanceof ServiceError) return { error: e.message }; throw e; }
  done();
  return { ok: "Configuración guardada." };
}

export async function createRuleAction(_: FormMsg, fd: FormData): Promise<FormMsg> {
  const ctx = await requireOrg("ADMIN");
  const kind = String(fd.get("kind"));
  const scope = String(fd.get("scope"));
  const config = kind === "BUDGET_ALERT"
    ? { kind, maxDailyBudget: num(fd.get("maxDailyBudget")) }
    : { kind: "PAUSE", maxCostPerResult: num(fd.get("maxCostPerResult")), minSpend: num(fd.get("minSpend")), minObservationDays: num(fd.get("minObservationDays")), minConversions: num(fd.get("minConversions")) ?? 1 };
  try {
    await createRule({ organizationId: ctx.organizationId, userId: ctx.user.id }, { name: String(fd.get("name") ?? ""), scope, scopeId: scope === "ACCOUNT" ? null : String(fd.get("scopeId") ?? "") || null, config });
  } catch (e) { return { error: e instanceof ServiceError ? e.message : "Revisa los valores de la regla (todos deben ser números positivos)." }; }
  done();
  return { ok: "Regla creada." };
}

export async function emergencyAction(fd: FormData) {
  const ctx = await requireOrg("ADMIN");
  return guarded(async () => { await setEmergencyStop({ organizationId: ctx.organizationId, userId: ctx.user.id }, fd.get("on") === "1"); return fd.get("on") === "1" ? "Botón de emergencia ACTIVADO: ZENTRA no escribirá nada en Meta." : "Botón de emergencia desactivado."; });
}
export async function toggleRuleAction(fd: FormData) {
  const ctx = await requireOrg("ADMIN");
  return guarded(() => setRuleEnabled({ organizationId: ctx.organizationId, userId: ctx.user.id }, String(fd.get("id")), fd.get("enabled") === "1"));
}
export async function deleteRuleAction(fd: FormData) {
  const ctx = await requireOrg("ADMIN");
  return guarded(() => deleteRule({ organizationId: ctx.organizationId, userId: ctx.user.id }, String(fd.get("id"))));
}
export async function approveActionAction(fd: FormData) {
  const ctx = await requireOrg("ADMIN");
  return guarded(async () => { const r = await approveAction({ organizationId: ctx.organizationId, userId: ctx.user.id }, String(fd.get("id"))); return r.note ?? (r.status === "EXECUTED" ? "Acción ejecutada." : `Resultado: ${r.status}`); });
}
export async function rejectActionAction(fd: FormData) {
  const ctx = await requireOrg("ADMIN");
  return guarded(async () => { await rejectAction({ organizationId: ctx.organizationId, userId: ctx.user.id }, String(fd.get("id"))); return "Acción rechazada."; });
}
export async function resumeAction(fd: FormData) {
  const ctx = await requireOrg("ADMIN");
  return guarded(async () => { const r = await requestResume({ organizationId: ctx.organizationId, userId: ctx.user.id }, String(fd.get("id"))); return r.note ?? (r.status === "EXECUTED" ? "Anuncio reactivado." : `Resultado: ${r.status}`); });
}
export async function evaluateNowAction() {
  const ctx = await requireOrg("ADMIN");
  return guarded(async () => { const r = await evaluateOrganization(ctx.organizationId); return r.reason ? `Evaluado. ${r.reason}.` : `Evaluado: ${r.proposed} propuesta(s), ${r.executed} ejecutada(s), ${r.simulated} simulada(s), ${r.blocked} bloqueada(s).`; });
}
