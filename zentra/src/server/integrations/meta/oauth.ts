import { db } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import { audit } from "@/server/audit/audit";
import { metaConfig } from "./config";
import { GraphClient, type GraphOptions } from "./graph";

// Mínimo privilegio: solo lectura. `ads_management` (pausar/reactivar) se pide aparte, solo si el usuario lo autoriza (Fase 5).
export const SCOPES = ["ads_read"];
export const MANAGE_SCOPES = ["ads_read", "ads_management"];

export function buildAuthUrl(state: string, opts: { manage?: boolean } = {}): string {
  const c = metaConfig();
  const u = new URL(c.dialogBase);
  u.searchParams.set("client_id", c.appId);
  u.searchParams.set("redirect_uri", c.redirectUri);
  u.searchParams.set("state", state);
  u.searchParams.set("scope", (opts.manage ? MANAGE_SCOPES : SCOPES).join(","));
  u.searchParams.set("response_type", "code");
  return u.toString();
}

type TokenResp = { access_token: string; expires_in?: number };

/** code → token corto → token de larga duración (~60 días). Devuelve el token y su vencimiento. */
export async function exchangeForLongLivedToken(code: string, opts: GraphOptions = {}) {
  const c = metaConfig();
  const g = new GraphClient(null, opts);
  const short = await g.get<TokenResp>("oauth/access_token", { client_id: c.appId, redirect_uri: c.redirectUri, client_secret: c.appSecret, code });
  const long = await g.get<TokenResp>("oauth/access_token", { grant_type: "fb_exchange_token", client_id: c.appId, client_secret: c.appSecret, fb_exchange_token: short.access_token });
  const ttl = long.expires_in ?? 60 * 24 * 3600;
  return { token: long.access_token, expiresAt: new Date(Date.now() + ttl * 1000) };
}

type GraphAdAccount = { id: string; account_id: string; name: string; currency?: string; timezone_name?: string };

/**
 * Registra las cuentas publicitarias autorizadas. Quedan SIN sincronización activa:
 * el usuario elige cuáles sincronizar (respetando el límite de su plan).
 */
export async function connectMeta(p: { organizationId: string; userId: string; code: string }, opts: GraphOptions = {}) {
  const { token, expiresAt } = await exchangeForLongLivedToken(p.code, opts);
  const g = new GraphClient(token, opts);
  const me = await g.get<{ id: string }>("me", { fields: "id" });
  const accounts: GraphAdAccount[] = [];
  for await (const a of g.paginate<GraphAdAccount>("me/adaccounts", { fields: "id,account_id,name,currency,timezone_name", limit: "100" })) accounts.push(a);

  // Permisos realmente concedidos (el usuario puede haber rechazado alguno): no se asume nada.
  let canManage = false;
  try {
    const perms = await g.get<{ data: { permission: string; status: string }[] }>("me/permissions");
    canManage = perms.data.some((x) => x.permission === "ads_management" && x.status === "granted");
  } catch { /* sin información: se asume solo lectura */ }

  const enc = encryptSecret(token);
  for (const a of accounts) {
    const externalId = a.id.startsWith("act_") ? a.id : `act_${a.account_id}`;
    await db.adAccount.upsert({
      where: { organizationId_platform_externalId: { organizationId: p.organizationId, platform: "META", externalId } },
      create: { organizationId: p.organizationId, platform: "META", externalId, name: a.name, currency: a.currency, timezone: a.timezone_name, accessTokenEnc: enc, tokenExpiresAt: expiresAt, metaUserId: me.id, canManage },
      update: { name: a.name, currency: a.currency, timezone: a.timezone_name, accessTokenEnc: enc, tokenExpiresAt: expiresAt, metaUserId: me.id, canManage, status: "ACTIVE", lastError: null },
    });
  }
  await audit({ action: "meta.connect", userId: p.userId, organizationId: p.organizationId, metadata: { accounts: accounts.length, canManage } });
  return { count: accounts.length };
}
