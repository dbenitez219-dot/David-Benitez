import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { audit } from "@/server/audit/audit";
import { MetaApiError } from "@/server/integrations/meta/errors";
import { GraphClient, type GraphOptions } from "@/server/integrations/meta/graph";
import { notifyOnce } from "@/server/notifications/notify";
import { getAccess } from "@/server/billing/access";
import { inWindow } from "./rules";

export type Trigger = "auto" | "user";
export type ExecOutcome = { status: "EXECUTED" | "SIMULATED" | "REJECTED" | "FAILED" | "PROPOSED" | "SKIPPED"; note?: string };

const DAY = 86_400_000;

/**
 * Ejecuta (o simula) una acción sobre un anuncio. Es la ÚNICA puerta por la que ZENTRA escribe en Meta.
 * Compuertas, en orden: reclamo atómico (anti-duplicados) → parada de emergencia → (si es automática) modo, horario y límite
 * diario → simulación → permiso ads_management y token → revalidación del estado real → ejecución → registro.
 * Si una compuerta bloquea, la acción vuelve a PROPOSED con la nota del motivo (no se pierde ni se ejecuta a medias).
 */
export async function executeAction(actionId: string, o: { trigger: Trigger; userId?: string; now?: Date } & GraphOptions): Promise<ExecOutcome> {
  const now = o.now ?? new Date();
  // 1) Reclamo atómico: solo un ejecutor puede tomar la acción.
  const claim = await db.automationAction.updateMany({ where: { id: actionId, status: { in: ["PROPOSED", "APPROVED"] } }, data: { status: "EXECUTING" } });
  if (claim.count === 0) return { status: "SKIPPED", note: "La acción ya fue procesada." };
  const action = await db.automationAction.findUniqueOrThrow({ where: { id: actionId } });
  const orgId = action.organizationId;

  const finish = async (status: "EXECUTED" | "SIMULATED" | "REJECTED" | "FAILED" | "PROPOSED", data: { note?: string; result?: object; previousState?: object }) => {
    await db.automationAction.update({ where: { id: actionId }, data: { status, note: data.note, result: data.result, previousState: data.previousState ?? undefined, executedAt: status === "EXECUTED" || status === "SIMULATED" ? now : null, decidedBy: o.userId ?? action.decidedBy } });
    await audit({ action: `automation.${status.toLowerCase()}`, userId: o.userId, organizationId: orgId, entity: "AutomationAction", entityId: actionId, metadata: { type: action.type, ad: action.adExternalId, trigger: o.trigger, note: data.note ?? null } });
    return { status, note: data.note } as ExecOutcome;
  };

  try {
    const settings = await db.automationSettings.findUnique({ where: { organizationId: orgId } });
    if (!settings) return finish("PROPOSED", { note: "Sin configuración de automatización." });
    if (settings.emergencyStop) return finish("PROPOSED", { note: "Bloqueada: el botón de emergencia está activado." });

    if (!(await getAccess(orgId, now)).premium) return finish("PROPOSED", { note: "Bloqueada: la suscripción no está activa." });
    const org = await db.organization.findUniqueOrThrow({ where: { id: orgId }, select: { timezone: true } });
    if (o.trigger === "auto") {
      if (!settings.enabled || settings.mode !== "AUTOMATIC") return finish("PROPOSED", { note: "Las automatizaciones automáticas no están activas." });
      if (!inWindow(now, org.timezone, settings.activeFromHour, settings.activeToHour)) return finish("PROPOSED", { note: `Fuera del horario permitido (${settings.activeFromHour}:00–${settings.activeToHour}:00).` });
      const done = await db.automationAction.count({ where: { organizationId: orgId, status: { in: ["EXECUTED", "SIMULATED"] }, executedAt: { gte: new Date(now.getTime() - DAY) } } });
      if (done >= settings.maxActionsPerDay) return finish("PROPOSED", { note: `Límite diario alcanzado (${settings.maxActionsPerDay} acciones en 24 h).` });
    }

    const ad = action.adId ? await db.ad.findFirst({ where: { id: action.adId, organizationId: orgId }, include: { adSet: { include: { campaign: { include: { adAccount: true } } } } } }) : null;
    if (!ad) return finish("REJECTED", { note: "El anuncio ya no existe." });
    const acct = ad.adSet.campaign.adAccount;
    const target = action.type === "PAUSE" ? "PAUSED" : "ACTIVE";
    const localPrev = { status: ad.status };

    // 2) Simulación: no se toca ninguna cuenta real.
    if (settings.dryRun || acct.isDemo) {
      return finish("SIMULATED", { previousState: localPrev, note: acct.isDemo ? "Simulado: cuenta de demostración." : "Simulado: el modo de simulación está activo.",
        result: { simulated: true, wouldSet: target, ad: ad.name } });
    }

    // 3) Permisos y token
    if (!acct.canManage) return finish("PROPOSED", { note: "Falta el permiso de gestión (ads_management). Autorízalo en Automatizaciones." });
    if (!acct.accessTokenEnc || acct.status === "REVOKED" || (acct.tokenExpiresAt && acct.tokenExpiresAt < now)) return finish("PROPOSED", { note: "La conexión con Meta no está vigente. Vuelve a conectar." });
    const g = new GraphClient(decryptSecret(acct.accessTokenEnc), o);

    // 4) Revalidar el estado REAL antes de actuar
    const live = await g.get<{ status?: string; effective_status?: string }>(ad.externalId, { fields: "status,effective_status" });
    const liveStatus = live.effective_status ?? live.status ?? "UNKNOWN";
    const previousState = { status: liveStatus, configured: live.status ?? null };
    if (action.type === "PAUSE" && liveStatus !== "ACTIVE") {
      await db.ad.update({ where: { id: ad.id }, data: { status: liveStatus === "PAUSED" || liveStatus.endsWith("_PAUSED") ? "PAUSED" : liveStatus } });
      return finish("REJECTED", { previousState, note: `No se pausó: el anuncio ya no estaba activo (estado en Meta: ${liveStatus}).` });
    }
    if (action.type === "RESUME" && liveStatus === "ACTIVE") return finish("REJECTED", { previousState, note: "No se reactivó: el anuncio ya estaba activo." });

    // 5) Ejecutar
    const resp = await g.post(ad.externalId, { status: target });
    await db.ad.update({ where: { id: ad.id }, data: { status: target === "PAUSED" ? "PAUSED" : "ACTIVE" } });
    const out = await finish("EXECUTED", { previousState, result: { response: resp, newStatus: target } });
    await notifyOnce(orgId, { type: "automation", severity: "important", dedupeHours: 1, title: `${action.type === "PAUSE" ? "Anuncio pausado" : "Anuncio reactivado"}: ${ad.name}`,
      body: action.reason, recommendation: action.type === "PAUSE" ? "Revisa el anuncio; si no estás de acuerdo, puedes reactivarlo desde Automatizaciones." : "Vigila su rendimiento los próximos días." });
    return out;
  } catch (e) {
    const err = e instanceof MetaApiError ? e : new MetaApiError((e as Error).message, "OTHER", 0);
    if (err.kind === "AUTH" && action.adId) {
      const a = await db.ad.findUnique({ where: { id: action.adId }, include: { adSet: { include: { campaign: true } } } });
      if (a) await db.adAccount.update({ where: { id: a.adSet.campaign.adAccountId }, data: { status: "EXPIRED", lastError: err.message.slice(0, 500) } });
    }
    await notifyOnce(orgId, { type: "automation_error", severity: "important", title: `No se pudo ${action.type === "PAUSE" ? "pausar" : "reactivar"} un anuncio`, body: err.message,
      recommendation: err.kind === "AUTH" ? "Vuelve a conectar Meta en Conexiones." : err.kind === "PERMISSION" ? "Revisa el permiso de gestión de anuncios y el acceso a la cuenta." : "ZENTRA no repetirá la acción automáticamente; revísala en el registro." });
    return finish("FAILED", { result: { error: err.message, kind: err.kind } });
  }
}
