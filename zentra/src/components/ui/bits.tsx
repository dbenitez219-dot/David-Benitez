import type { AdClassification } from "@prisma/client";
import { CLASS_STYLE } from "@/lib/classification";
import { getT } from "@/lib/locale";
import type { Trend } from "@/server/analytics/metrics";

export async function ClassBadge({ c }: { c: AdClassification }) {
  const t = await getT();
  return <span className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${CLASS_STYLE[c]}`}>{t(`class.${c}`)}</span>;
}

/** Variación vs. período anterior. lowerIsBetter invierte el color (p. ej. costo por resultado). */
export async function Delta({ value, lowerIsBetter = false }: { value: number | null; lowerIsBetter?: boolean }) {
  const t = await getT();
  if (value === null) return <span className="text-xs text-muted">{t("delta.none")}</span>;
  const good = lowerIsBetter ? value < 0 : value > 0;
  const color = Math.abs(value) < 0.5 ? "text-muted" : good ? "text-emerald-400" : "text-red-400";
  return <span className={`text-xs font-medium ${color}`}>{value > 0 ? "▲" : value < 0 ? "▼" : "•"} {Math.abs(value).toFixed(1)}% {t("delta.vs")}</span>;
}

export function KpiCard({ label, value, delta, note }: { label: string; value: string; delta?: React.ReactNode; note?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1.5 whitespace-nowrap text-base font-semibold tabular-nums sm:text-lg xl:text-xl">{value}</p>
      <div className="mt-1 min-h-4">{delta}</div>
      {note && <p className="mt-1 text-[11px] text-muted">{note}</p>}
    </div>
  );
}

export async function TrendMark({ t: trend }: { t: Trend }) {
  const t = await getT();
  if (!trend) return <span className="text-xs text-muted">—</span>;
  const m = { UP: ["trend.up", "text-emerald-400"], FLAT: ["trend.flat", "text-muted"], DOWN: ["trend.down", "text-red-400"] }[trend];
  return <span className={`text-xs font-medium ${m[1]}`}>{t(m[0])}</span>;
}

export function Sparkline({ values, width = 120, height = 32 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return <svg width={width} height={height} aria-hidden />;
  const max = Math.max(1, ...values);
  const d = values.map((v, i) => `${i ? "L" : "M"}${((i / (values.length - 1)) * width).toFixed(1)},${(height - 2 - (v / max) * (height - 4)).toFixed(1)}`).join("");
  return <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden><path d={d} fill="none" stroke="#e5202e" strokeWidth="1.8" strokeLinejoin="round" /></svg>;
}

export function DemoTag() {
  return <span className="rounded border border-zred/50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zred">Demo</span>;
}
