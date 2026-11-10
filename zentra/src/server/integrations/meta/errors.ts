export type MetaErrorKind = "AUTH" | "PERMISSION" | "RATE_LIMIT" | "TRANSIENT" | "OTHER";

export class MetaApiError extends Error {
  constructor(message: string, readonly kind: MetaErrorKind, readonly status: number, readonly code?: number, readonly subcode?: number) {
    super(message);
    this.name = "MetaApiError";
  }
}

const RATE = new Set([4, 17, 32, 341, 613, 80000, 80001, 80002, 80003, 80004, 80005, 80006, 80008, 80014]);
const TRANSIENT = new Set([1, 2, 368]);

/** Clasifica un error de la Graph API (https://developers.facebook.com/docs/graph-api/guides/error-handling). */
export function classifyMetaError(status: number, body: unknown): MetaApiError {
  const e = (body as { error?: { message?: string; code?: number; error_subcode?: number } } | null)?.error;
  const code = e?.code, sub = e?.error_subcode;
  const msg = e?.message ?? `Error HTTP ${status}`;
  let kind: MetaErrorKind = "OTHER";
  if (code === 190 || code === 102 || status === 401) kind = "AUTH"; // token vencido o revocado
  else if (code !== undefined && (RATE.has(code))) kind = "RATE_LIMIT";
  else if (code === 10 || code === 278 || (code !== undefined && code >= 200 && code <= 299)) kind = "PERMISSION";
  else if ((code !== undefined && TRANSIENT.has(code)) || status >= 500) kind = "TRANSIENT";
  else if (status === 429) kind = "RATE_LIMIT";
  return new MetaApiError(msg, kind, status, code, sub);
}
