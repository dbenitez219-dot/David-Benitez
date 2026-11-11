import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/server/audit/audit";
import type { GraphOptions } from "@/server/integrations/meta/graph";
import { getAccess, requirePremium } from "@/server/billing/access";
import { executeAction, type ExecOutcome } from "./executor";
import { ruleConfig, SCOPES } from "./rules";

import { ServiceError } from "@/server/errors";
export { ServiceError };

export const settingsSchema = z.object({
  mode: z.enum(["MANUAL", "ASSISTED", "AUTOMATIC"]),
  enabled: z.boolean(), dryRun: z.boolean(), notifyEmail: z.boolean(), confirmReal: z.boolean().default(false),
  maxActionsPerDay: z.coerce.number().int().min(1).max(100),
  activeFromHour: z.coerce.number().int().min(0).max(23), activeToHour: z.coerce.number().int().min(1).max(24),
});

/** Guarda la configuración. Pasar a automático REAL (activo, automático y sin simulación) exige confirmación explícita. */
export async function saveSettings(p: { organizationId: string; userId: string }, input: z.infer<typeof settingsSchema>) {
  const real = input.enabled && input.mode === "AUTOMATIC" && !input.dryRun;
  if (real && !input.confirmReal) throw new ServiceError("Para activar el modo automático real debes confirmar que entiendes que ZENTRA pausará anuncios reales sin pedirte permiso cada vez.");
  if (input.enabled) await requirePremium(p.organizationId); // activar automatizaciones es una función premium
  const { confirmReal: _c, ...data } = input;
  await db.automationSettings.upsert({ where: { organizationId: p.organizationId }, update: data, create: { organizationId: p.organizationId, ...data } });
  await audit({ action: "automation.settings", userId: p.userId, organizationId: p.organizationId, metadata: { ...data, real } });
}

/** Botón de emergencia: detiene TODA escritura en Meta (automática y por aprobación) hasta que se desactive. */
export async function setEmergencyStop(p: { organizationId: string; userId: string }, on: boolean) {
  await db.automationSettings.upsert({ where: { organizationId: p.organizationId }, update: { emergencyStop: on }, create: { organizationId: p.organizationId, emergencyStop: on } });
  await audit({ action: on ? "automation.emergency_on" : "automation.emergency_off", userId: p.userId, organizationId: p.organizationId });
}

const ruleInput = z.object({ name: z.string().trim().min(2).max(80), scope: z.enum(SCOPES), scopeId: z.string().regex(/^[a-z0-9]{10,40}$/).nullable(), config: ruleConfig });

export async function createRule(p: { organizationId: string; userId: string }, raw: unknown) {
  const r = ruleInput.parse(raw);
  const access = await requirePremium(p.organizationId);
  const count = await db.automationRule.count({ where: { organizationId: p.organizationId } });
  if (count >= access.entitlements.maxRules) throw new ServiceError(`Tu plan permite hasta ${access.entitlements.maxRules} reglas. Cambia de plan para crear más.`);
  if (r.scope !== "ACCOUNT") {
    if (!r.scopeId) throw new ServiceError("Elige a qué aplica la regla.");
    // El objetivo debe pertenecer a la organización (anti-IDOR).
    const where = { id: r.scopeId, organizationId: p.organizationId };
    const found = r.scope === "CAMPAIGN" ? await db.campaign.findFirst({ where }) : r.scope === "ADSET" ? await db.adSet.findFirst({ where }) : await db.ad.findFirst({ where });
    if (!found) throw new ServiceError("El objetivo de la regla no existe.");
  }
  const row = await db.automationRule.create({ data: { organizationId: p.organizationId, name: r.name, scope: r.scope, scopeId: r.scope === "ACCOUNT" ? null : r.scopeId, config: r.config, enabled: true } });
  await audit({ action: "automation.rule_create", userId: p.userId, organizationId: p.organizationId, entity: "AutomationRule", entityId: row.id });
  return row;
}

export async function setRuleEnabled(p: { organizationId: string; userId: string }, id: string, enabled: boolean) {
  const r = await db.automationRule.updateMany({ where: { id, organizationId: p.organizationId }, data: { enabled } });
  if (r.count === 0) throw new ServiceError("Regla no encontrada.");
  await audit({ action: enabled ? "automation.rule_enable" : "automation.rule_disable", userId: p.userId, organizationId: p.organizationId, entity: "AutomationRule", entityId: id });
}

export async function deleteRule(p: { organizationId: string; userId: string }, id: string) {
  const r = await db.automationRule.deleteMany({ where: { id, organizationId: p.organizationId } });
  if (r.count === 0) throw new ServiceError("Regla no encontrada.");
  await audit({ action: "automation.rule_delete", userId: p.userId, organizationId: p.organizationId, entity: "AutomationRule", entityId: id });
}

async function ownAction(organizationId: string, id: string) {
  const a = await db.automationAction.findFirst({ where: { id, organizationId } });
  if (!a) throw new ServiceError("Acción no encontrada.");
  return a;
}

/** Un administrador autoriza una propuesta: se ejecuta (o simula) pasando las mismas compuertas de seguridad. */
export async function approveAction(p: { organizationId: string; userId: string }, id: string, g: GraphOptions = {}): Promise<ExecOutcome> {
  const a = await ownAction(p.organizationId, id);
  if (a.status !== "PROPOSED") throw new ServiceError("Esta acción ya no está pendiente.");
  await db.automationAction.update({ where: { id }, data: { decidedBy: p.userId } });
  return executeAction(id, { trigger: "user", userId: p.userId, ...g });
}

export async function rejectAction(p: { organizationId: string; userId: string }, id: string) {
  const a = await ownAction(p.organizationId, id);
  const r = await db.automationAction.updateMany({ where: { id: a.id, status: "PROPOSED" }, data: { status: "REJECTED", decidedBy: p.userId, note: "Rechazada por un administrador." } });
  if (r.count === 0) throw new ServiceError("Esta acción ya no está pendiente.");
  await audit({ action: "automation.rejected", userId: p.userId, organizationId: p.organizationId, entity: "AutomationAction", entityId: id });
}

/** Reactivar un anuncio NUNCA es automático: lo solicita y autoriza una persona. */
export async function requestResume(p: { organizationId: string; userId: string }, adId: string, g: GraphOptions = {}): Promise<ExecOutcome> {
  const ad = await db.ad.findFirst({ where: { id: adId, organizationId: p.organizationId } });
  if (!ad) throw new ServiceError("Anuncio no encontrado.");
  if (ad.status !== "PAUSED") throw new ServiceError("Solo se pueden reactivar anuncios pausados.");
  const user = await db.user.findUniqueOrThrow({ where: { id: p.userId }, select: { name: true } });
  const created = await db.automationAction.create({ data: {
    organizationId: p.organizationId, adId: ad.id, adExternalId: ad.externalId, type: "RESUME", status: "PROPOSED", source: "USER", decidedBy: p.userId,
    reason: `Reactivación autorizada por ${user.name}.`, previousState: { status: ad.status }, idempotencyKey: `RESUME:${ad.id}:${Date.now()}`,
  } });
  return executeAction(created.id, { trigger: "user", userId: p.userId, ...g });
}
