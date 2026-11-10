import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { notifyOnce } from "@/server/notifications/notify";
import { MetaApiError } from "./errors";
import { GraphClient, type GraphOptions } from "./graph";
import { budgetToMajor, mapInsight, mapStatus, resultObjective, safeHttpsUrl, type GraphInsight } from "./mapping";

const LEASE_MS = 10 * 60 * 1000;
const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

export type SyncResult = { ok: boolean; skipped?: string; campaigns?: number; adSets?: number; ads?: number; insights?: number; skippedInsights?: number; error?: string };

/** Sincroniza una cuenta: estructura (campañas/conjuntos/anuncios) y estadísticas diarias. Idempotente. */
export async function syncAdAccount(accountId: string, opts: GraphOptions & { days?: number } = {}): Promise<SyncResult> {
  const now = new Date();
  // Arrendamiento atómico: impide dos sincronizaciones simultáneas de la misma cuenta.
  const lease = await db.adAccount.updateMany({
    where: { id: accountId, platform: "META", isDemo: false, syncEnabled: true, OR: [{ syncLockedUntil: null }, { syncLockedUntil: { lt: now } }] },
    data: { syncLockedUntil: new Date(now.getTime() + LEASE_MS) },
  });
  if (lease.count === 0) return { ok: false, skipped: "no habilitada, demo o ya en sincronización" };

  const acct = await db.adAccount.findUniqueOrThrow({ where: { id: accountId } });
  const orgId = acct.organizationId;
  try {
    if (!acct.accessTokenEnc || acct.status === "REVOKED") throw new MetaApiError("La cuenta no tiene una autorización vigente", "AUTH", 401);
    if (acct.tokenExpiresAt && acct.tokenExpiresAt < now) throw new MetaApiError("El permiso de Meta venció", "AUTH", 401);
    const g = new GraphClient(decryptSecret(acct.accessTokenEnc), opts);
    const since = new Date(now.getTime() - (opts.days ?? (acct.lastSyncAt ? 14 : 90)) * DAY);
    const act = acct.externalId;

    // 1) Estructura
    const campMap = new Map<string, string>(), setMap = new Map<string, string>(), adMap = new Map<string, string>();
    let nCamp = 0, nSet = 0, nAd = 0;
    for await (const c of g.paginate<any>(`${act}/campaigns`, { fields: "id,name,objective,status,effective_status,daily_budget,start_time", limit: "200" })) {
      const data = { name: c.name, objective: resultObjective(c.objective), rawObjective: c.objective ?? null, status: mapStatus(c.effective_status, c.status), dailyBudget: budgetToMajor(c.daily_budget, acct.currency), startTime: c.start_time ? new Date(c.start_time) : null };
      const row = await db.campaign.upsert({ where: { adAccountId_externalId: { adAccountId: acct.id, externalId: c.id } }, create: { organizationId: orgId, adAccountId: acct.id, externalId: c.id, ...data }, update: data });
      campMap.set(c.id, row.id); nCamp++;
    }
    for await (const s of g.paginate<any>(`${act}/adsets`, { fields: "id,name,campaign_id,status,effective_status,daily_budget", limit: "200" })) {
      const campaignId = campMap.get(s.campaign_id);
      if (!campaignId) continue;
      const data = { name: s.name, status: mapStatus(s.effective_status, s.status), dailyBudget: budgetToMajor(s.daily_budget, acct.currency) };
      const row = await db.adSet.upsert({ where: { campaignId_externalId: { campaignId, externalId: s.id } }, create: { organizationId: orgId, campaignId, externalId: s.id, ...data }, update: data });
      setMap.set(s.id, row.id); nSet++;
    }
    for await (const a of g.paginate<any>(`${act}/ads`, { fields: "id,name,adset_id,status,effective_status,created_time,creative{thumbnail_url}", limit: "200" })) {
      const adSetId = setMap.get(a.adset_id);
      if (!adSetId) continue;
      const data = { name: a.name, status: mapStatus(a.effective_status, a.status), creativeUrl: safeHttpsUrl(a.creative?.thumbnail_url), startTime: a.created_time ? new Date(a.created_time) : null };
      const row = await db.ad.upsert({ where: { adSetId_externalId: { adSetId, externalId: a.id } }, create: { organizationId: orgId, adSetId, externalId: a.id, ...data }, update: data });
      adMap.set(a.id, row.id); nAd++;
    }

    // 2) Estadísticas diarias (a nivel de anuncio)
    const rows = [];
    let skippedInsights = 0;
    for await (const r of g.paginate<GraphInsight>(`${act}/insights`, {
      level: "ad", time_increment: "1", limit: "500",
      time_range: JSON.stringify({ since: iso(since), until: iso(now) }),
      fields: "ad_id,date_start,spend,impressions,reach,clicks,actions,action_values",
    })) {
      const { adExternalId, ...m } = mapInsight(r);
      const adId = adMap.get(adExternalId);
      if (!adId) { skippedInsights++; continue; }
      rows.push({ organizationId: orgId, adId, ...m });
    }
    await db.$transaction([
      db.adInsightDaily.deleteMany({ where: { organizationId: orgId, adId: { in: [...adMap.values()] }, date: { gte: new Date(`${iso(since)}T00:00:00Z`) } } }),
      db.adInsightDaily.createMany({ data: rows }),
    ]);

    await db.adAccount.update({ where: { id: acct.id }, data: { lastSyncAt: new Date(), lastError: null, status: "ACTIVE", syncLockedUntil: null } });

    // Aviso preventivo: el token de larga duración no se renueva solo.
    if (acct.tokenExpiresAt && acct.tokenExpiresAt.getTime() - now.getTime() < 7 * DAY)
      await notifyOnce(orgId, { type: "connection", severity: "warning", title: "Tu conexión con Meta vence pronto", body: `El permiso de ${acct.name} vence el ${iso(acct.tokenExpiresAt)}.`, recommendation: "Ve a Conexiones y vuelve a conectar Meta antes de esa fecha para no perder la sincronización." });
    return { ok: true, campaigns: nCamp, adSets: nSet, ads: nAd, insights: rows.length, skippedInsights };
  } catch (err) {
    const e = err instanceof MetaApiError ? err : new MetaApiError((err as Error).message, "OTHER", 0);
    const auth = e.kind === "AUTH";
    await db.adAccount.update({ where: { id: acct.id }, data: { lastError: e.message.slice(0, 500), status: auth ? "EXPIRED" : "ERROR", syncLockedUntil: null } });
    await notifyOnce(orgId, auth
      ? { type: "connection", severity: "important", title: "Hay que volver a conectar Meta", body: `Meta rechazó el permiso de ${acct.name}: ${e.message}`, recommendation: "Ve a Conexiones y pulsa «Conectar Meta» de nuevo. Tus datos anteriores se conservan." }
      : { type: "sync_error", severity: "warning", title: "Error al sincronizar con Meta", body: `No se pudo actualizar ${acct.name}: ${e.message}`, recommendation: e.kind === "RATE_LIMIT" ? "Meta limitó temporalmente las consultas. ZENTRA reintentará automáticamente." : e.kind === "PERMISSION" ? "Revisa que tu usuario de Meta tenga acceso a esta cuenta publicitaria." : "Si el problema persiste, intenta reconectar la cuenta." });
    return { ok: false, error: e.message };
  }
}

/** Sincroniza todas las cuentas habilitadas (lo invoca el cron). */
export async function syncAll(opts: GraphOptions = {}) {
  const accounts = await db.adAccount.findMany({ where: { platform: "META", isDemo: false, syncEnabled: true, status: { in: ["ACTIVE", "ERROR"] } }, select: { id: true } });
  const out = [];
  for (const a of accounts) out.push({ id: a.id, ...(await syncAdAccount(a.id, opts)) });
  return out;
}
