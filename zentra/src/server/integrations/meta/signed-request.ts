import { createHmac, timingSafeEqual } from "node:crypto";

/** Verifica y decodifica el `signed_request` que Meta envía a deauthorize / data deletion. */
export function parseSignedRequest(signed: string, appSecret: string): { user_id?: string; algorithm?: string } | null {
  const [sig, payload] = signed.split(".");
  if (!sig || !payload || !appSecret) return null;
  const expected = createHmac("sha256", appSecret).update(payload).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data?.algorithm?.toUpperCase() === "HMAC-SHA256" ? data : null;
  } catch { return null; }
}

export function signRequest(data: object, appSecret: string): string {
  const payload = Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", ...data })).toString("base64url");
  return `${createHmac("sha256", appSecret).update(payload).digest("base64url")}.${payload}`;
}
