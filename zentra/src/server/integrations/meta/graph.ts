import { createHmac } from "node:crypto";
import { classifyMetaError, MetaApiError } from "./errors";
import { metaConfig } from "./config";

export type GraphOptions = {
  fetcher?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
  baseDelayMs?: number;
};

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Cliente mínimo de la Graph API. El token viaja en la cabecera Authorization (no en la URL, para
 * no filtrarlo a logs), se firma con appsecret_proof y se reintentan errores transitorios y límites de tasa.
 */
export class GraphClient {
  private f: typeof fetch;
  private sleep: (ms: number) => Promise<void>;
  private max: number;
  private base: number;

  constructor(private token: string | null, opts: GraphOptions = {}) {
    this.f = opts.fetcher ?? fetch;
    this.sleep = opts.sleep ?? realSleep;
    this.max = opts.maxRetries ?? 3;
    this.base = opts.baseDelayMs ?? 1000;
  }

  private url(path: string, params: Record<string, string>) {
    const c = metaConfig();
    const u = new URL(path.startsWith("http") ? path : `${c.graphBase}/${path.replace(/^\//, "")}`);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    if (this.token && c.appSecret && !path.startsWith("http")) u.searchParams.set("appsecret_proof", createHmac("sha256", c.appSecret).update(this.token).digest("hex"));
    return u;
  }

  async get<T = any>(path: string, params: Record<string, string> = {}): Promise<T> {
    const url = this.url(path, params);
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await this.f(url, { headers: this.token ? { Authorization: `Bearer ${this.token}` } : {}, cache: "no-store" });
      } catch (err) {
        if (attempt >= this.max) throw new MetaApiError(`Error de red: ${(err as Error).message}`, "TRANSIENT", 0);
        await this.sleep(this.base * 2 ** attempt);
        continue;
      }
      const body = await res.json().catch(() => null);
      if (res.ok && !(body as { error?: unknown } | null)?.error) return body as T;
      const err = classifyMetaError(res.status, body);
      if ((err.kind === "RATE_LIMIT" || err.kind === "TRANSIENT") && attempt < this.max) {
        const retryAfter = Number(res.headers.get("retry-after"));
        await this.sleep(retryAfter > 0 ? Math.min(retryAfter * 1000, 60_000) : this.base * 2 ** attempt * (err.kind === "RATE_LIMIT" ? 4 : 1));
        continue;
      }
      throw err;
    }
  }

  /** Recorre todas las páginas de un listado (paging.next). Tope de páginas para evitar bucles. */
  async *paginate<T = any>(path: string, params: Record<string, string> = {}, maxPages = 200): AsyncGenerator<T> {
    let next: string | null = null;
    for (let page = 0; page < maxPages; page++) {
      const body: { data?: T[]; paging?: { next?: string } } = next ? await this.get(next) : await this.get(path, params);
      for (const row of body.data ?? []) yield row;
      next = body.paging?.next ?? null;
      if (!next) return;
    }
  }
}
