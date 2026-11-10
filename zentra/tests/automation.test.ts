import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import { registerUser } from "@/server/auth/service";
import { GraphClient } from "@/server/integrations/meta/graph";
import { buildAuthUrl, connectMeta } from "@/server/integrations/meta/oauth";
import { setMailerForTests } from "@/server/notifications/email";
import { evaluateOrganization } from "@/server/automation/engine";
import { executeAction } from "@/server/automation/executor";
import { decidePause, inWindow, ruleFor, parseRules, pauseConfig } from "@/server/automation/rules";
import { approveAction, createRule, deleteRule, rejectAction, requestResume, saveSettings, ServiceError, setEmergencyStop } from "@/server/automation/service";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
const sleep = async () => {};

type Live = Record<string, { status: string; effective_status: string }>;
function fakeMeta(live: Live = {}, opts: { postError?: { code: number; message: string } } = {}) {
  const posts: { path: string; body: string; headers: any; url: string }[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = new URL(String(input)); const id = u.pathname.split("/").pop()!;
    if ((init?.method ?? "GET") === "POST") {
      posts.push({ path: u.pathname, body: String(init?.body), headers: init?.headers, url: String(input) });
      return opts.postError ? json({ error: opts.postError }, 400) : json({ success: true });
    }
    return json(live[id] ?? { status: "ACTIVE", effective_status: "ACTIVE" });
  }) as typeof fetch;
  return { fetcher, posts, g: { fetcher, sleep } };
}

const PW = "Correcta12345";
async function mkOrg(email: string, o: { canManage?: boolean } = {}) {
  const r = await registerUser({ name: "Ana", email, password: PW, organizationName: "Org" });
  if (!r.ok) throw new Error("registro");
  const organizationId = r.data.organizationId as string, userId = r.data.userId;
  await db.organization.update({ where: { id: organizationId }, data: { timezone: "UTC" } });
  const acct = await db.adAccount.create({ data: { organizationId, platform: "META", externalId: "act_1", name: "Cuenta", currency: "PYG", accessTokenEnc: encryptSecret("TOK"), tokenExpiresAt: new Date(Date.now() + 40 * 86_400_000), canManage: o.canManage ?? true, syncEnabled: true } });
  const camp = await db.campaign.create({ data: { organizationId, adAccountId: acct.id, externalId: "c1", name: "Camp", objective: "MESSAGES", status: "ACTIVE" } });
  const set = await db.adSet.create({ data: { organizationId, campaignId: camp.id, externalId: "s1", name: "Set", status: "ACTIVE" } });
  return { organizationId, userId, acct, camp, set };
}
type Env = Awaited<ReturnType<typeof mkOrg>>;
const DAY = 86_400_000;
const today0 = () => { const n = new Date(); return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()); };
async function mkAd(e: Env, name: string, o: { days: number; spend: number; results: number; status?: string; lastDaySpend?: number }) {
  const ad = await db.ad.create({ data: { organizationId: e.organizationId, adSetId: e.set.id, externalId: `ad_${name}`, name, status: o.status ?? "ACTIVE", startTime: new Date(today0() - o.days * DAY) } });
  await db.adInsightDaily.createMany({ data: Array.from({ length: o.days }, (_, i) => {
    const spend = i === 0 && o.lastDaySpend !== undefined ? o.lastDaySpend : o.spend;
    return { organizationId: e.organizationId, adId: ad.id, date: new Date(today0() - i * DAY), spend, impressions: Math.round(spend / 5), reach: Math.round(spend / 8), clicks: Math.round(spend / 200), messages: i === 0 ? o.results : 0, leads: 0, conversions: 0 };
  }) });
  return ad;
}
const RULE = { kind: "PAUSE" as const, maxCostPerResult: 5000, minSpend: 50_000, minObservationDays: 5, minConversions: 1 };
const setSettings = (organizationId: string, data: object) => db.automationSettings.upsert({ where: { organizationId }, update: data, create: { organizationId, ...data } });
async function scenario(email: string, settings: object = {}, canManage = true) {
  const e = await mkOrg(email, { canManage });
  const loser = await mkAd(e, "perdedor", { days: 10, spend: 20_000, results: 0 });
  await mkAd(e, "bueno", { days: 10, spend: 20_000, results: 100 });
  await mkAd(e, "nuevo", { days: 2, spend: 90_000, results: 0 });
  await mkAd(e, "pausado", { days: 10, spend: 20_000, results: 0, status: "PAUSED" });
  await db.automationRule.create({ data: { organizationId: e.organizationId, name: "Costo alto", scope: "ACCOUNT", config: RULE, enabled: true } });
  await setSettings(e.organizationId, settings);
  return { e, loser };
}
const actions = (organizationId: string) => db.automationAction.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } });

beforeEach(async () => {
  setMailerForTests(undefined);
  await db.rateLimit.deleteMany(); await db.auditLog.deleteMany(); await db.organization.deleteMany(); await db.user.deleteMany();
});
afterAll(() => { setMailerForTests(undefined); return db.$disconnect(); });

describe("reglas", () => {
  const ad = (o: Partial<any> = {}) => ({ id: "a1", adSetId: "s1", campaignId: "c1", status: "ACTIVE", activeDays: 10, totals: { spend: 200_000, results: 0, impressions: 50_000 }, ...o }) as any;
  const cfg = pauseConfig.parse(RULE);
  it("evita decisiones precipitadas", () => {
    expect(decidePause(ad({ totals: { spend: 10_000, results: 0, impressions: 9000 } }), cfg, "PYG", 1000).pause).toBe(false); // poco gasto
    expect(decidePause(ad({ activeDays: 2 }), cfg, "PYG", 1000).pause).toBe(false); // poco tiempo
    expect(decidePause(ad({ totals: { spend: 200_000, results: 0, impressions: 100 } }), cfg, "PYG", 1000).pause).toBe(false); // pocas impresiones
    expect(decidePause(ad({ status: "PAUSED" }), cfg, "PYG", 1000).pause).toBe(false);
    expect(decidePause(ad({ totals: { spend: 80_000, results: 0, impressions: 5000 } }), cfg, "PYG", 1000).pause).toBe(false); // sin resultados pero < 2x mínimo
  });
  it("pausa por costo alto o por gasto alto sin resultados, con motivo", () => {
    expect(decidePause(ad({ totals: { spend: 200_000, results: 10, impressions: 5000 } }), cfg, "PYG", 1000)).toMatchObject({ pause: true, reason: expect.stringContaining("supera tu máximo") });
    expect(decidePause(ad({ totals: { spend: 200_000, results: 100, impressions: 5000 } }), cfg, "PYG", 1000).pause).toBe(false);
    expect(decidePause(ad(), cfg, "PYG", 1000)).toMatchObject({ pause: true, reason: expect.stringContaining("sin ningún resultado") });
    expect(decidePause(ad(), pauseConfig.parse({ ...RULE, minConversions: 5 }), "PYG", 1000).pause).toBe(true);
    expect(decidePause(ad({ totals: { spend: 200_000, results: 3, impressions: 5000 } }), pauseConfig.parse({ ...RULE, minConversions: 5 }), "PYG", 1000).pause).toBe(false); // pocos resultados para juzgar
  });
  it("la regla más específica gana", () => {
    const rules = parseRules([
      { id: "r1", name: "cuenta", scope: "ACCOUNT", scopeId: null, config: RULE, enabled: true },
      { id: "r2", name: "campaña", scope: "CAMPAIGN", scopeId: "c1", config: RULE, enabled: true },
      { id: "r3", name: "anuncio", scope: "AD", scopeId: "a1", config: RULE, enabled: true },
      { id: "r4", name: "apagada", scope: "AD", scopeId: "a1", config: RULE, enabled: false },
      { id: "r5", name: "corrupta", scope: "AD", scopeId: "a1", config: { kind: "PAUSE" }, enabled: true },
    ]);
    expect(rules).toHaveLength(3);
    expect(ruleFor(ad(), rules, "PAUSE")?.id).toBe("r3");
    expect(ruleFor(ad({ id: "otro" }), rules, "PAUSE")?.id).toBe("r2");
    expect(ruleFor(ad({ id: "otro", campaignId: "x" }), rules, "PAUSE")?.id).toBe("r1");
  });
  it("ventana horaria, incluso cruzando la medianoche", () => {
    const t = new Date("2026-06-10T15:00:00Z");
    expect(inWindow(t, "UTC", 0, 24)).toBe(true); expect(inWindow(t, "UTC", 9, 18)).toBe(true); expect(inWindow(t, "UTC", 16, 18)).toBe(false);
    expect(inWindow(t, "UTC", 22, 6)).toBe(false); expect(inWindow(new Date("2026-06-10T23:00:00Z"), "UTC", 22, 6)).toBe(true);
  });
});

describe("modos y propuestas", () => {
  it("por defecto todo está apagado: modo manual, simulación y sin acciones", async () => {
    const { e } = await scenario("a@x.com", {});
    const s = await db.automationSettings.findUniqueOrThrow({ where: { organizationId: e.organizationId } });
    expect(s).toMatchObject({ mode: "MANUAL", enabled: false, dryRun: true, emergencyStop: false });
    const r = await evaluateOrganization(e.organizationId, fakeMeta().g);
    expect(r.active).toBe(false); expect(await actions(e.organizationId)).toHaveLength(0);
  });
  it("modo manual aunque esté activada: solo recomienda", async () => {
    const { e } = await scenario("a@x.com", { enabled: true, mode: "MANUAL" });
    await evaluateOrganization(e.organizationId, fakeMeta().g);
    expect(await actions(e.organizationId)).toHaveLength(0);
  });
  it("modo asistido propone solo anuncios que cumplen la regla y no duplica (ni en paralelo)", async () => {
    const { e, loser } = await scenario("a@x.com", { enabled: true, mode: "ASSISTED" });
    const m = fakeMeta();
    const [a, b] = await Promise.all([evaluateOrganization(e.organizationId, m.g), evaluateOrganization(e.organizationId, m.g)]);
    await evaluateOrganization(e.organizationId, m.g);
    const acts = await actions(e.organizationId);
    expect(acts).toHaveLength(1);
    expect(acts[0]).toMatchObject({ adId: loser.id, type: "PAUSE", status: "PROPOSED", source: "RULE" });
    expect(acts[0].reason).toContain("sin ningún resultado"); expect(acts[0].previousState).toEqual({ status: "ACTIVE" });
    expect(a.proposed + b.proposed).toBe(1); expect(m.posts).toHaveLength(0);
    expect((await db.notification.findMany({ where: { organizationId: e.organizationId, type: "approval" } }))).toHaveLength(1);
  });
  it("las propuestas viejas sin decidir caducan", async () => {
    const { e, loser } = await scenario("a@x.com", { enabled: true, mode: "ASSISTED" });
    await db.automationAction.create({ data: { organizationId: e.organizationId, adId: loser.id, adExternalId: loser.externalId, type: "PAUSE", reason: "vieja", idempotencyKey: "old", createdAt: new Date(Date.now() - 3 * DAY) } });
    const r = await evaluateOrganization(e.organizationId, fakeMeta().g);
    expect(r.expired).toBe(1); expect((await db.automationAction.findFirstOrThrow({ where: { idempotencyKey: "old" } })).status).toBe("REJECTED");
  });
});

describe("ejecución y compuertas", () => {
  async function proposed(settings: object = {}, canManage = true) {
    const s = await scenario("a@x.com", { enabled: true, mode: "ASSISTED", ...settings }, canManage);
    const m = fakeMeta(); await evaluateOrganization(s.e.organizationId, m.g);
    const [act] = await actions(s.e.organizationId);
    return { ...s, act };
  }
  it("en simulación NO toca Meta", async () => {
    const { e, act, loser } = await proposed({ dryRun: true });
    const m = fakeMeta();
    const r = await approveAction(e, act.id, m.g);
    expect(r.status).toBe("SIMULATED"); expect(m.posts).toHaveLength(0);
    expect((await db.ad.findUniqueOrThrow({ where: { id: loser.id } })).status).toBe("ACTIVE");
    expect((await db.automationAction.findUniqueOrThrow({ where: { id: act.id } })).result).toMatchObject({ simulated: true, wouldSet: "PAUSED" });
  });
  it("aprobada y en modo real: revalida, pausa una vez, registra estado anterior, resultado, auditoría y aviso", async () => {
    const { e, act, loser } = await proposed({ dryRun: false });
    const m = fakeMeta();
    expect((await approveAction(e, act.id, m.g)).status).toBe("EXECUTED");
    expect(m.posts).toHaveLength(1);
    expect(m.posts[0].path).toMatch(/\/ad_perdedor$/); expect(m.posts[0].body).toBe("status=PAUSED");
    expect(m.posts[0].url).not.toContain("TOK"); expect(m.posts[0].body).not.toContain("TOK"); expect(m.posts[0].headers.Authorization).toBe("Bearer TOK");
    const after = await db.automationAction.findUniqueOrThrow({ where: { id: act.id } });
    expect(after).toMatchObject({ status: "EXECUTED", decidedBy: e.userId }); expect(after.executedAt).not.toBeNull();
    expect(after.previousState).toMatchObject({ status: "ACTIVE" }); expect(after.result).toMatchObject({ newStatus: "PAUSED" });
    expect((await db.ad.findUniqueOrThrow({ where: { id: loser.id } })).status).toBe("PAUSED");
    expect((await db.auditLog.findMany({ where: { action: "automation.executed" } }))).toHaveLength(1);
    expect((await db.notification.findFirstOrThrow({ where: { organizationId: e.organizationId, type: "automation" } })).title).toContain("Anuncio pausado");
    await expect(approveAction(e, act.id, m.g)).rejects.toThrow(ServiceError); // no se puede aprobar dos veces
    expect(m.posts).toHaveLength(1);
  });
  it("dos ejecuciones simultáneas de la misma acción pausan solo una vez", async () => {
    const { act } = await proposed({ dryRun: false });
    const m = fakeMeta();
    const rs = await Promise.all([executeAction(act.id, { trigger: "user", ...m.g }), executeAction(act.id, { trigger: "user", ...m.g })]);
    expect(rs.map((r) => r.status).sort()).toEqual(["EXECUTED", "SKIPPED"]); expect(m.posts).toHaveLength(1);
  });
  it("revalida el estado real: si ya no está activo, no hace nada", async () => {
    const { e, act } = await proposed({ dryRun: false });
    const m = fakeMeta({ ad_perdedor: { status: "PAUSED", effective_status: "PAUSED" } });
    const r = await approveAction(e, act.id, m.g);
    expect(r.status).toBe("REJECTED"); expect(r.note).toContain("ya no estaba activo"); expect(m.posts).toHaveLength(0);
  });
  it("sin permiso ads_management queda pendiente con la explicación", async () => {
    const { e, act } = await proposed({ dryRun: false }, false);
    const m = fakeMeta();
    const r = await approveAction(e, act.id, m.g);
    expect(r.status).toBe("PROPOSED"); expect(r.note).toContain("ads_management"); expect(m.posts).toHaveLength(0);
  });
  it("el botón de emergencia bloquea todo: no se proponen ni se ejecutan acciones", async () => {
    const { e, act } = await proposed({ dryRun: false });
    await setEmergencyStop(e, true);
    const m = fakeMeta();
    expect((await approveAction(e, act.id, m.g)).note).toContain("emergencia"); expect(m.posts).toHaveLength(0);
    await db.automationAction.deleteMany({ where: { organizationId: e.organizationId } });
    const r = await evaluateOrganization(e.organizationId, m.g);
    expect(r.active).toBe(false); expect(await actions(e.organizationId)).toHaveLength(0);
    await setEmergencyStop(e, false);
    expect((await db.auditLog.findMany({ where: { action: { startsWith: "automation.emergency" } } })).map((a) => a.action).sort()).toEqual(["automation.emergency_off", "automation.emergency_on"]);
  });
  it("una falla de Meta queda registrada como FALLIDA y avisa", async () => {
    const { e, act } = await proposed({ dryRun: false });
    const m = fakeMeta({}, { postError: { code: 100, message: "Invalid parameter" } });
    expect((await approveAction(e, act.id, m.g)).status).toBe("FAILED");
    const a = await db.automationAction.findUniqueOrThrow({ where: { id: act.id } });
    expect(a.result).toMatchObject({ error: "Invalid parameter" });
    expect(await db.notification.count({ where: { organizationId: e.organizationId, type: "automation_error" } })).toBe(1);
  });
  it("un token rechazado marca la cuenta como vencida", async () => {
    const { e, act } = await proposed({ dryRun: false });
    const m = fakeMeta({}, { postError: { code: 190, message: "expired" } });
    await approveAction(e, act.id, m.g);
    expect((await db.adAccount.findFirstOrThrow({ where: { organizationId: e.organizationId } })).status).toBe("EXPIRED");
  });
});

describe("modo automático", () => {
  it("con simulación activa solo simula", async () => {
    const { e } = await scenario("a@x.com", { enabled: true, mode: "AUTOMATIC", dryRun: true });
    const m = fakeMeta(); const r = await evaluateOrganization(e.organizationId, m.g);
    expect(r).toMatchObject({ proposed: 1, simulated: 1, executed: 0 }); expect(m.posts).toHaveLength(0);
  });
  it("en modo real ejecuta lo que cumple la regla y nada más", async () => {
    const { e } = await scenario("a@x.com", { enabled: true, mode: "AUTOMATIC", dryRun: false });
    const m = fakeMeta(); const r = await evaluateOrganization(e.organizationId, m.g);
    expect(r.executed).toBe(1); expect(m.posts.map((p) => p.path.split("/").pop())).toEqual(["ad_perdedor"]);
    const again = await evaluateOrganization(e.organizationId, m.g); // el anuncio ya está pausado: no se repite
    expect(again.proposed).toBe(0); expect(m.posts).toHaveLength(1);
  });
  it("respeta el límite diario de acciones", async () => {
    const { e } = await scenario("a@x.com", { enabled: true, mode: "AUTOMATIC", dryRun: false, maxActionsPerDay: 1 });
    await mkAd(e, "perdedor2", { days: 10, spend: 20_000, results: 0 });
    const m = fakeMeta(); const r = await evaluateOrganization(e.organizationId, m.g);
    expect(r).toMatchObject({ proposed: 2, executed: 1, blocked: 1 }); expect(m.posts).toHaveLength(1);
    const pend = (await actions(e.organizationId)).find((a) => a.status === "PROPOSED");
    expect(pend?.note).toContain("Límite diario");
  });
  it("respeta el horario permitido", async () => {
    const h = new Date().getUTCHours();
    const { e } = await scenario("a@x.com", { enabled: true, mode: "AUTOMATIC", dryRun: false, activeFromHour: (h + 2) % 24, activeToHour: ((h + 4) % 24) || 24 });
    const m = fakeMeta(); const r = await evaluateOrganization(e.organizationId, m.g);
    expect(r).toMatchObject({ proposed: 1, executed: 0, blocked: 1 }); expect(m.posts).toHaveLength(0);
    expect((await actions(e.organizationId))[0].note).toContain("horario");
  });
  it("desactivada no ejecuta nada aunque el modo sea automático", async () => {
    const { e } = await scenario("a@x.com", { enabled: false, mode: "AUTOMATIC", dryRun: false });
    const m = fakeMeta(); await evaluateOrganization(e.organizationId, m.g);
    expect(m.posts).toHaveLength(0); expect(await actions(e.organizationId)).toHaveLength(0);
  });
});

describe("reactivación, permisos y aislamiento", () => {
  it("reactivar es siempre una decisión de una persona; el motor nunca crea reactivaciones", async () => {
    const { e } = await scenario("a@x.com", { enabled: true, mode: "AUTOMATIC", dryRun: false });
    const m = fakeMeta({ ad_pausado: { status: "PAUSED", effective_status: "PAUSED" } });
    await evaluateOrganization(e.organizationId, m.g);
    expect((await actions(e.organizationId)).some((a) => a.type === "RESUME")).toBe(false);
    const paused = await db.ad.findFirstOrThrow({ where: { organizationId: e.organizationId, name: "pausado" } });
    const r = await requestResume(e, paused.id, m.g);
    expect(r.status).toBe("EXECUTED");
    expect(m.posts.at(-1)?.body).toBe("status=ACTIVE");
    const act = await db.automationAction.findFirstOrThrow({ where: { type: "RESUME" } });
    expect(act).toMatchObject({ source: "USER", decidedBy: e.userId });
    const active = await db.ad.findFirstOrThrow({ where: { organizationId: e.organizationId, name: "perdedor" } });
    await db.ad.update({ where: { id: active.id }, data: { status: "ACTIVE" } });
    await expect(requestResume(e, active.id, m.g)).rejects.toThrow(/pausados/);
  });
  it("una organización no puede aprobar, rechazar ni borrar reglas de otra", async () => {
    const a = await scenario("a@x.com", { enabled: true, mode: "ASSISTED" });
    const b = await mkOrg("b@x.com");
    await evaluateOrganization(a.e.organizationId, fakeMeta().g);
    const [act] = await actions(a.e.organizationId);
    const rule = await db.automationRule.findFirstOrThrow({ where: { organizationId: a.e.organizationId } });
    await expect(approveAction(b, act.id, fakeMeta().g)).rejects.toThrow(ServiceError);
    await expect(rejectAction(b, act.id)).rejects.toThrow(ServiceError);
    await expect(deleteRule(b, rule.id)).rejects.toThrow(ServiceError);
    await expect(requestResume(b, a.loser.id)).rejects.toThrow(ServiceError);
    expect((await db.automationAction.findUniqueOrThrow({ where: { id: act.id } })).status).toBe("PROPOSED");
    await rejectAction(a.e, act.id);
    expect((await db.automationAction.findUniqueOrThrow({ where: { id: act.id } })).status).toBe("REJECTED");
  });
  it("una regla solo puede apuntar a objetivos de la propia organización y valida sus parámetros", async () => {
    const a = await mkOrg("a@x.com"), b = await mkOrg("b@x.com");
    await expect(createRule(b, { name: "Regla ajena", scope: "CAMPAIGN", scopeId: a.camp.id, config: RULE })).rejects.toThrow(/no existe/);
    await expect(createRule(a, { name: "Regla mala", scope: "ACCOUNT", scopeId: null, config: { ...RULE, maxCostPerResult: -1 } })).rejects.toThrow();
    const ok = await createRule(a, { name: "Mi regla", scope: "CAMPAIGN", scopeId: a.camp.id, config: RULE });
    expect(ok.enabled).toBe(true);
    expect(await db.auditLog.count({ where: { action: "automation.rule_create" } })).toBe(1);
  });
  it("activar el automático real exige confirmación explícita", async () => {
    const e = await mkOrg("a@x.com");
    const base = { mode: "AUTOMATIC" as const, enabled: true, dryRun: false, notifyEmail: false, maxActionsPerDay: 5, activeFromHour: 0, activeToHour: 24 };
    await expect(saveSettings(e, { ...base, confirmReal: false })).rejects.toThrow(/confirmar/);
    await saveSettings(e, { ...base, dryRun: true, confirmReal: false }); // simulación: no hace falta
    await saveSettings(e, { ...base, confirmReal: true });
    expect((await db.auditLog.findMany({ where: { action: "automation.settings" } })).length).toBe(2);
  });
});

describe("avisos y correo", () => {
  it("avisa de gasto inusual, ganadores y presupuesto superado, sin duplicar, también en modo manual", async () => {
    const e = await mkOrg("a@x.com");
    await mkAd(e, "picudo", { days: 10, spend: 20_000, results: 50, lastDaySpend: 150_000 });
    await mkAd(e, "estrella", { days: 10, spend: 30_000, results: 300 });
    await mkAd(e, "mediocre", { days: 10, spend: 30_000, results: 40 });
    await db.automationRule.create({ data: { organizationId: e.organizationId, name: "Tope diario", scope: "ACCOUNT", config: { kind: "BUDGET_ALERT", maxDailyBudget: 100_000 }, enabled: true } });
    const m = fakeMeta();
    await evaluateOrganization(e.organizationId, m.g); await evaluateOrganization(e.organizationId, m.g);
    const types = (await db.notification.findMany({ where: { organizationId: e.organizationId } })).map((n) => n.type).sort();
    expect(types).toContain("anomaly"); expect(types).toContain("budget"); expect(types).toContain("winner");
    expect(types.filter((t) => t === "budget")).toHaveLength(1);
    const an = await db.notification.findFirstOrThrow({ where: { type: "anomaly" } });
    expect(an.recommendation).toBeTruthy(); expect(an.body).toBeTruthy(); expect(an.severity).toBe("important");
    expect(await actions(e.organizationId)).toHaveLength(0);
  });
  it("envía correo de lo importante solo si la organización lo activó", async () => {
    const send = vi.fn(async () => {}); setMailerForTests({ send });
    const e = await mkOrg("a@x.com");
    await mkAd(e, "picudo", { days: 10, spend: 20_000, results: 50, lastDaySpend: 150_000 });
    await evaluateOrganization(e.organizationId, fakeMeta().g);
    expect(send).not.toHaveBeenCalled();
    await db.notification.deleteMany();
    await setSettings(e.organizationId, { notifyEmail: true });
    await evaluateOrganization(e.organizationId, fakeMeta().g);
    expect(send).toHaveBeenCalledTimes(1);
    const [to, subject, text] = send.mock.calls[0] as unknown as [string[], string, string];
    expect(to).toEqual(["a@x.com"]); expect(subject).toContain("[ZENTRA]"); expect(text).toContain("Qué hacer");
    expect((await db.notification.findFirstOrThrow({ where: { type: "anomaly" } })).emailedAt).not.toBeNull();
  });
});

describe("permiso de gestión de Meta", () => {
  it("la URL pide ads_management solo cuando el usuario lo solicita", () => {
    expect(new URL(buildAuthUrl("s")).searchParams.get("scope")).toBe("ads_read");
    expect(new URL(buildAuthUrl("s", { manage: true })).searchParams.get("scope")).toBe("ads_read,ads_management");
  });
  it("registra lo realmente concedido y no asume nada si no hay información", async () => {
    const e = await mkOrg("a@x.com");
    const graph = (perms: Response | null) => (async (input: RequestInfo | URL) => {
      const p = new URL(String(input)).pathname.replace(/^\/v[\d.]+/, "");
      if (p === "/oauth/access_token") return json({ access_token: "T", expires_in: 5000 });
      if (p === "/me") return json({ id: "fb1" });
      if (p === "/me/adaccounts") return json({ data: [{ id: "act_9", account_id: "9", name: "N", currency: "PYG" }] });
      if (p === "/me/permissions") return perms ?? json({ error: { code: 1, message: "x" } }, 500);
      return json({ error: { code: 100 } }, 400);
    }) as typeof fetch;
    await connectMeta({ organizationId: e.organizationId, userId: e.userId, code: "c" }, { fetcher: graph(json({ data: [{ permission: "ads_read", status: "granted" }, { permission: "ads_management", status: "granted" }] })), sleep, maxRetries: 0 });
    expect((await db.adAccount.findFirstOrThrow({ where: { externalId: "act_9" } })).canManage).toBe(true);
    await connectMeta({ organizationId: e.organizationId, userId: e.userId, code: "c" }, { fetcher: graph(json({ data: [{ permission: "ads_management", status: "declined" }] })), sleep, maxRetries: 0 });
    expect((await db.adAccount.findFirstOrThrow({ where: { externalId: "act_9" } })).canManage).toBe(false);
    await connectMeta({ organizationId: e.organizationId, userId: e.userId, code: "c" }, { fetcher: graph(null), sleep, maxRetries: 0 });
    expect((await db.adAccount.findFirstOrThrow({ where: { externalId: "act_9" } })).canManage).toBe(false);
  });
  it("las escrituras viajan en el cuerpo del formulario con el token en la cabecera", async () => {
    const m = fakeMeta();
    await new GraphClient("SECRETO", m.g).post("123", { status: "PAUSED" });
    expect(m.posts[0].body).toBe("status=PAUSED"); expect(m.posts[0].url).not.toContain("SECRETO"); expect(m.posts[0].headers["content-type"]).toBe("application/x-www-form-urlencoded");
  });
});
