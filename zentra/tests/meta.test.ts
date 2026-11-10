import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { registerUser } from "@/server/auth/service";
import { classifyMetaError, MetaApiError } from "@/server/integrations/meta/errors";
import { GraphClient } from "@/server/integrations/meta/graph";
import { budgetToMajor, mapInsight, mapStatus, resultObjective, safeHttpsUrl } from "@/server/integrations/meta/mapping";
import { parseSignedRequest, signRequest } from "@/server/integrations/meta/signed-request";
import { connectMeta, buildAuthUrl } from "@/server/integrations/meta/oauth";
import { syncAdAccount } from "@/server/integrations/meta/sync";
import { handleDataDeletion, handleDeauthorize } from "@/server/integrations/meta/deauthorize";
import { maxSyncedAccounts } from "@/server/integrations/meta/limits";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const sleep = vi.fn(async () => {});

const today = new Date().toISOString().slice(0, 10);
/** Graph API simulada con respuestas con el mismo formato que devuelve Meta. */
function fakeGraph(overrides: Record<string, () => Response> = {}) {
  const calls: URL[] = [];
  const routes: Record<string, () => Response> = {
    "/oauth/access_token": () => json({ access_token: "LONG_TOKEN_abc", expires_in: 5_184_000 }),
    "/me": () => json({ id: "fbuser1" }),
    "/me/adaccounts": () => json({ data: [{ id: "act_111", account_id: "111", name: "Mi Cuenta", currency: "PYG", timezone_name: "America/Asuncion" }, { id: "act_222", account_id: "222", name: "Otra", currency: "USD" }] }),
    "/act_111/campaigns": () => json({ data: [
      { id: "c1", name: "Ventas", objective: "OUTCOME_SALES", status: "ACTIVE", effective_status: "ACTIVE", daily_budget: "150000", start_time: "2026-01-01T00:00:00+0000" },
      { id: "c2", name: "Leads", objective: "OUTCOME_LEADS", status: "ACTIVE", effective_status: "PAUSED" }] }),
    "/act_111/adsets": () => json({ data: [{ id: "s1", name: "Conj 1", campaign_id: "c1", status: "ACTIVE", effective_status: "ACTIVE" }, { id: "s2", name: "Conj 2", campaign_id: "c2", status: "ACTIVE", effective_status: "PAUSED" }, { id: "huerfano", name: "x", campaign_id: "nope", status: "ACTIVE" }] }),
    "/act_111/ads": () => json({ data: [
      { id: "a1", name: "Anuncio venta", adset_id: "s1", status: "ACTIVE", effective_status: "ACTIVE", created_time: "2026-01-02T00:00:00+0000", creative: { thumbnail_url: "https://cdn.example.com/a1.jpg" } },
      { id: "a2", name: "Anuncio lead", adset_id: "s2", status: "ACTIVE", effective_status: "DISAPPROVED", creative: { thumbnail_url: "javascript:alert(1)" } }] }),
    "/act_111/insights": () => json({ data: [
      { ad_id: "a1", date_start: today, spend: "50000", impressions: "10000", reach: "8000", clicks: "200",
        actions: [{ action_type: "purchase", value: "4" }, { action_type: "omni_purchase", value: "4" }], action_values: [{ action_type: "purchase", value: "400000" }, { action_type: "omni_purchase", value: "400000" }] },
      { ad_id: "a2", date_start: today, spend: "20000", impressions: "3000", reach: "2500", clicks: "60", actions: [{ action_type: "lead", value: "5" }, { action_type: "onsite_conversion.lead_grouped", value: "5" }, { action_type: "onsite_conversion.messaging_conversation_started_7d", value: "9" }] },
      { ad_id: "desconocido", date_start: today, spend: "1", impressions: "1", clicks: "0" }] }),
    ...overrides,
  };
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = new URL(String(input)); calls.push(Object.assign(u, { _h: init?.headers }) as URL);
    const key = u.pathname.replace(/^\/v[\d.]+/, "");
    const r = routes[key];
    return r ? r() : json({ error: { message: "ruta no simulada " + key, code: 100 } }, 400);
  }) as typeof fetch;
  return { fetcher, calls };
}

const PW = "Correcta12345";
async function org(email: string) {
  const r = await registerUser({ name: "T", email, password: PW, organizationName: "Org" });
  if (!r.ok) throw new Error("registro");
  return r.data.organizationId!;
}
async function metaAccount(organizationId: string, extra: Record<string, unknown> = {}) {
  return db.adAccount.create({ data: { organizationId, platform: "META", externalId: "act_111", name: "Mi Cuenta", currency: "PYG", accessTokenEnc: encryptSecret("TOKEN"), tokenExpiresAt: new Date(Date.now() + 40 * 86_400_000), syncEnabled: true, metaUserId: "fbuser1", ...extra } });
}

beforeEach(async () => {
  sleep.mockClear();
  await db.dataDeletionRequest.deleteMany(); await db.rateLimit.deleteMany(); await db.auditLog.deleteMany(); await db.organization.deleteMany(); await db.user.deleteMany();
});
afterAll(() => db.$disconnect());

describe("errores de la Graph API", () => {
  it("clasifica", () => {
    expect(classifyMetaError(400, { error: { code: 190, message: "x" } }).kind).toBe("AUTH");
    expect(classifyMetaError(400, { error: { code: 17 } }).kind).toBe("RATE_LIMIT");
    expect(classifyMetaError(400, { error: { code: 80004 } }).kind).toBe("RATE_LIMIT");
    expect(classifyMetaError(403, { error: { code: 200 } }).kind).toBe("PERMISSION");
    expect(classifyMetaError(500, null).kind).toBe("TRANSIENT");
    expect(classifyMetaError(400, { error: { code: 100 } }).kind).toBe("OTHER");
  });
});

describe("cliente Graph", () => {
  it("envía el token en cabecera (no en la URL) con appsecret_proof", async () => {
    const { fetcher, calls } = fakeGraph();
    await new GraphClient("SECRET_TOKEN", { fetcher, sleep }).get("me");
    expect(calls[0].toString()).not.toContain("SECRET_TOKEN");
    expect(calls[0].searchParams.get("appsecret_proof")).toMatch(/^[a-f0-9]{64}$/);
    expect(((calls[0] as any)._h as Record<string, string>).Authorization).toBe("Bearer SECRET_TOKEN");
  });
  it("reintenta límites de tasa y errores transitorios con espera", async () => {
    let n = 0;
    const fetcher = (async () => (++n < 3 ? json({ error: { code: 17, message: "limit" } }, 400) : json({ ok: 1 }))) as typeof fetch;
    expect(await new GraphClient("t", { fetcher, sleep }).get("x")).toEqual({ ok: 1 });
    expect(n).toBe(3); expect(sleep).toHaveBeenCalledTimes(2);
  });
  it("se rinde tras los reintentos y NO reintenta errores de autenticación", async () => {
    let n = 0;
    const always = (async () => (n++, json({ error: { code: 4 } }, 400))) as typeof fetch;
    await expect(new GraphClient("t", { fetcher: always, sleep, maxRetries: 2 }).get("x")).rejects.toMatchObject({ kind: "RATE_LIMIT" });
    expect(n).toBe(3);
    n = 0;
    const auth = (async () => (n++, json({ error: { code: 190, message: "expired" } }, 401))) as typeof fetch;
    await expect(new GraphClient("t", { fetcher: auth, sleep }).get("x")).rejects.toBeInstanceOf(MetaApiError);
    expect(n).toBe(1);
  });
  it("pagina con paging.next", async () => {
    const fetcher = (async (u: RequestInfo | URL) => String(u).includes("page=2") ? json({ data: [{ i: 3 }] }) : json({ data: [{ i: 1 }, { i: 2 }], paging: { next: "https://graph.facebook.com/v1/x?page=2" } })) as typeof fetch;
    const out = []; for await (const r of new GraphClient("t", { fetcher, sleep }).paginate("x")) out.push(r);
    expect(out).toHaveLength(3);
  });
});

describe("mapeos", () => {
  it("objetivos y estados", () => {
    expect(resultObjective("OUTCOME_SALES")).toBe("SALES"); expect(resultObjective("OUTCOME_LEADS")).toBe("LEADS"); expect(resultObjective("OUTCOME_TRAFFIC")).toBe("MESSAGES");
    expect(mapStatus("CAMPAIGN_PAUSED")).toBe("PAUSED"); expect(mapStatus("DISAPPROVED")).toBe("DISAPPROVED"); expect(mapStatus(null, "ACTIVE")).toBe("ACTIVE");
  });
  it("presupuesto en unidad mínima según la moneda", () => {
    expect(budgetToMajor("150000", "PYG")).toBe(150000); expect(budgetToMajor("1500", "USD")).toBe(15); expect(budgetToMajor(null, "USD")).toBeNull();
  });
  it("solo acepta imágenes https", () => {
    expect(safeHttpsUrl("https://x.com/a.jpg")).not.toBeNull(); expect(safeHttpsUrl("javascript:alert(1)")).toBeNull(); expect(safeHttpsUrl("http://x.com")).toBeNull();
  });
  it("no cuenta dos veces el mismo evento y no inventa ingresos", () => {
    const a = mapInsight({ ad_id: "1", date_start: "2026-01-01", spend: "10", impressions: "100", clicks: "5", actions: [{ action_type: "purchase", value: "2" }, { action_type: "omni_purchase", value: "2" }] });
    expect(a.conversions).toBe(2); expect(a.revenue).toBeNull();
    const b = mapInsight({ ad_id: "1", date_start: "2026-01-01", actions: [{ action_type: "lead", value: "3" }, { action_type: "onsite_conversion.lead_grouped", value: "3" }] });
    expect(b.leads).toBe(3); expect(b.spend).toBe(0); expect(b.reach).toBeNull();
  });
});

describe("signed_request", () => {
  it("verifica la firma y rechaza manipulaciones", () => {
    const s = signRequest({ user_id: "42" }, "test_app_secret");
    expect(parseSignedRequest(s, "test_app_secret")?.user_id).toBe("42");
    expect(parseSignedRequest(s, "otro_secreto")).toBeNull();
    const [sig, payload] = s.split(".");
    const forged = Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "99" })).toString("base64url");
    expect(parseSignedRequest(`${sig}.${forged}`, "test_app_secret")).toBeNull();
    expect(parseSignedRequest("basura", "test_app_secret")).toBeNull(); void payload;
  });
});

describe("OAuth y conexión", () => {
  it("la URL pide solo lectura y lleva state", () => {
    const u = new URL(buildAuthUrl("st123"));
    expect(u.searchParams.get("scope")).toBe("ads_read"); expect(u.searchParams.get("state")).toBe("st123");
    expect(u.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/meta/callback");
  });
  it("registra cuentas con el token cifrado y sin sincronización activa", async () => {
    const o = await org("a@x.com");
    const { fetcher } = fakeGraph();
    const r = await connectMeta({ organizationId: o, userId: "u", code: "CODE" }, { fetcher, sleep });
    expect(r.count).toBe(2);
    const accts = await db.adAccount.findMany({ where: { organizationId: o } });
    expect(accts.every((a) => a.syncEnabled === false && a.metaUserId === "fbuser1")).toBe(true);
    expect(accts[0].accessTokenEnc).not.toContain("LONG_TOKEN");
    expect(decryptSecret(accts[0].accessTokenEnc!)).toBe("LONG_TOKEN_abc");
  });
});

describe("sincronización", () => {
  it("importa estructura y estadísticas con los mapeos correctos", async () => {
    const o = await org("a@x.com"); const acct = await metaAccount(o);
    const res = await syncAdAccount(acct.id, { fetcher: fakeGraph().fetcher, sleep });
    expect(res).toMatchObject({ ok: true, campaigns: 2, adSets: 2, ads: 2, insights: 2, skippedInsights: 1 });
    const camps = await db.campaign.findMany({ where: { organizationId: o }, orderBy: { name: "asc" } });
    expect(camps.map((c) => [c.objective, c.rawObjective, c.status])).toEqual([["LEADS", "OUTCOME_LEADS", "PAUSED"], ["SALES", "OUTCOME_SALES", "ACTIVE"]]);
    expect(Number(camps[1].dailyBudget)).toBe(150000);
    const a1 = await db.ad.findFirstOrThrow({ where: { organizationId: o, externalId: "a1" } });
    const a2 = await db.ad.findFirstOrThrow({ where: { organizationId: o, externalId: "a2" } });
    expect(a1.creativeUrl).toBe("https://cdn.example.com/a1.jpg"); expect(a2.creativeUrl).toBeNull(); expect(a2.status).toBe("DISAPPROVED");
    const i1 = await db.adInsightDaily.findFirstOrThrow({ where: { adId: a1.id } });
    expect([i1.conversions, Number(i1.revenue), Number(i1.spend)]).toEqual([4, 400000, 50000]);
    const i2 = await db.adInsightDaily.findFirstOrThrow({ where: { adId: a2.id } });
    expect([i2.leads, i2.messages, i2.revenue]).toEqual([5, 9, null]);
    const after = await db.adAccount.findUniqueOrThrow({ where: { id: acct.id } });
    expect(after.lastSyncAt).not.toBeNull(); expect(after.syncLockedUntil).toBeNull(); expect(after.status).toBe("ACTIVE");
  });
  it("es idempotente (no duplica datos al repetir)", async () => {
    const o = await org("a@x.com"); const acct = await metaAccount(o);
    const f = fakeGraph().fetcher;
    await syncAdAccount(acct.id, { fetcher: f, sleep }); await syncAdAccount(acct.id, { fetcher: f, sleep });
    expect(await db.adInsightDaily.count({ where: { organizationId: o } })).toBe(2);
    expect(await db.ad.count({ where: { organizationId: o } })).toBe(2);
  });
  it("token rechazado: marca la cuenta como vencida y notifica sin borrar datos", async () => {
    const o = await org("a@x.com"); const acct = await metaAccount(o);
    await syncAdAccount(acct.id, { fetcher: fakeGraph().fetcher, sleep });
    const bad = fakeGraph({ "/act_111/campaigns": () => json({ error: { code: 190, message: "Session expired" } }, 401) }).fetcher;
    const r = await syncAdAccount(acct.id, { fetcher: bad, sleep });
    expect(r.ok).toBe(false);
    expect((await db.adAccount.findUniqueOrThrow({ where: { id: acct.id } })).status).toBe("EXPIRED");
    const n = await db.notification.findFirstOrThrow({ where: { organizationId: o } });
    expect(n.recommendation).toContain("Conexiones");
    expect(await db.adInsightDaily.count({ where: { organizationId: o } })).toBe(2);
    await db.adAccount.update({ where: { id: acct.id }, data: { status: "ACTIVE" } });
    await syncAdAccount(acct.id, { fetcher: bad, sleep });
    expect(await db.notification.count({ where: { organizationId: o } })).toBe(1); // sin duplicados
  });
  it("no sincroniza cuentas desactivadas, demo o ya en curso", async () => {
    const o = await org("a@x.com");
    const off = await metaAccount(o, { syncEnabled: false });
    expect((await syncAdAccount(off.id, { fetcher: fakeGraph().fetcher, sleep })).skipped).toBeTruthy();
    const busy = await metaAccount(o, { externalId: "act_333", syncLockedUntil: new Date(Date.now() + 60_000) });
    expect((await syncAdAccount(busy.id, { fetcher: fakeGraph().fetcher, sleep })).skipped).toBeTruthy();
  });
  it("avisa cuando el permiso está por vencer", async () => {
    const o = await org("a@x.com"); const acct = await metaAccount(o, { tokenExpiresAt: new Date(Date.now() + 3 * 86_400_000) });
    await syncAdAccount(acct.id, { fetcher: fakeGraph().fetcher, sleep });
    expect((await db.notification.findFirstOrThrow({ where: { organizationId: o } })).title).toContain("vence pronto");
  });
});

describe("desautorización y eliminación de datos", () => {
  it("revoca solo las cuentas de ese usuario de Meta", async () => {
    const a = await org("a@x.com"), b = await org("b@x.com");
    const ea = await metaAccount(a); const eb = await metaAccount(b, { metaUserId: "otro" });
    expect(await handleDeauthorize("fbuser1")).toBe(1);
    const ra = await db.adAccount.findUniqueOrThrow({ where: { id: ea.id } }), rb = await db.adAccount.findUniqueOrThrow({ where: { id: eb.id } });
    expect([ra.accessTokenEnc, ra.status, ra.syncEnabled]).toEqual([null, "REVOKED", false]);
    expect([rb.status, rb.accessTokenEnc !== null]).toEqual(["ACTIVE", true]);
  });
  it("elimina cuentas y datos sincronizados y devuelve un código", async () => {
    const o = await org("a@x.com"); const acct = await metaAccount(o);
    await syncAdAccount(acct.id, { fetcher: fakeGraph().fetcher, sleep });
    const code = await handleDataDeletion("fbuser1");
    expect(code).toMatch(/^[a-f0-9]{24}$/);
    expect(await db.adAccount.count({ where: { organizationId: o } })).toBe(0);
    expect(await db.adInsightDaily.count({ where: { organizationId: o } })).toBe(0);
    expect((await db.dataDeletionRequest.findUniqueOrThrow({ where: { code } })).status).toBe("COMPLETED");
  });
});

describe("límites", () => {
  it("sin suscripción aplica el límite del plan Start", async () => {
    const o = await org("a@x.com");
    expect(await maxSyncedAccounts(o)).toBe(1);
  });
});
