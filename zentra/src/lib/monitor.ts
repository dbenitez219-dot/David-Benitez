/**
 * Registro estructurado y alertas de errores. Una línea JSON por evento (fácil de buscar en cualquier plataforma de logs);
 * los valores sensibles se ocultan. Si existe ERROR_WEBHOOK_URL (Slack u otro compatible) se envía un aviso, sin repetir el mismo
 * error más de una vez cada 5 minutos.
 */
const SENSITIVE = /token|secret|password|authorization|cookie|api[_-]?key|signature|hash/i;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SENSITIVE.test(k) ? "[oculto]" : redact(v, depth + 1)]));
}

type Level = "info" | "warn" | "error";
let sink: (line: string, level: Level) => void = (line, level) => (level === "error" ? console.error(line) : console.log(line));
/** Solo para pruebas. */
export const setLogSink = (fn: typeof sink | null) => { sink = fn ?? ((l, lv) => (lv === "error" ? console.error(l) : console.log(l))); };

function write(level: Level, msg: string, ctx: Record<string, unknown> = {}) {
  sink(JSON.stringify({ ts: new Date().toISOString(), level, msg, ...(redact(ctx) as object) }), level);
}
export const log = { info: (m: string, c?: Record<string, unknown>) => write("info", m, c), warn: (m: string, c?: Record<string, unknown>) => write("warn", m, c), error: (m: string, c?: Record<string, unknown>) => write("error", m, c) };

const recent = new Map<string, number>();
const WINDOW_MS = 5 * 60_000;
let fetcher: typeof fetch = (...a) => fetch(...a);
/** Solo para pruebas. */
export const setAlertFetcher = (f: typeof fetch | null) => { fetcher = f ?? ((...a) => fetch(...a)); recent.clear(); };

export async function reportError(err: unknown, ctx: Record<string, unknown> = {}): Promise<{ alerted: boolean }> {
  const e = err instanceof Error ? err : new Error(String(err));
  write("error", e.message, { ...ctx, name: e.name, stack: e.stack?.split("\n").slice(0, 6).join(" | ") });
  const url = process.env.ERROR_WEBHOOK_URL;
  if (!url) return { alerted: false };
  const fp = `${e.name}:${e.message}:${String(ctx.route ?? "")}`.slice(0, 200);
  const now = Date.now();
  if ((recent.get(fp) ?? 0) > now - WINDOW_MS) return { alerted: false };
  recent.set(fp, now);
  if (recent.size > 200) for (const [k, t] of recent) if (t < now - WINDOW_MS) recent.delete(k);
  try {
    const where = [ctx.route, ctx.job].filter(Boolean).join(" · ");
    await fetcher(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: `🚨 ZENTRA: ${e.name}: ${e.message.slice(0, 300)}${where ? ` (${where})` : ""}` }) });
    return { alerted: true };
  } catch { return { alerted: false }; } // la alerta nunca debe romper la solicitud
}
