"use client";
import { useMemo, useState } from "react";

type Pt = { date: string; spend: number; results: number; revenue: number };
const W = 800, H = 260, M = { l: 8, r: 8, t: 12, b: 24 };


export function Chart({ series, currency, showRevenue, locale, labels }: { series: Pt[]; currency: string; showRevenue: boolean; locale: string; labels: { spend: string; results: string; revenue: string; aria: string } }) {
  const fmt = (n: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(n);
  const [on, setOn] = useState({ spend: true, results: true, revenue: showRevenue });
  const [hover, setHover] = useState<number | null>(null);
  const n = series.length;
  const maxMoney = Math.max(1, ...series.map((p) => Math.max(on.spend ? p.spend : 0, on.revenue ? p.revenue : 0)));
  const maxRes = Math.max(1, ...series.map((p) => p.results));
  const x = (i: number) => M.l + (n <= 1 ? 0 : (i / (n - 1)) * (W - M.l - M.r));
  const y = (v: number, max: number) => M.t + (1 - v / max) * (H - M.t - M.b);
  const path = (f: (p: Pt) => number, max: number) => series.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(f(p), max).toFixed(1)}`).join("");
  const area = useMemo(() => `${path((p) => p.spend, maxMoney)}L${x(n - 1)},${H - M.b}L${x(0)},${H - M.b}Z`, [series, maxMoney]); // eslint-disable-line react-hooks/exhaustive-deps
  const h = hover !== null ? series[hover] : null;

  const toggle = (k: keyof typeof on, label: string, color: string, disabled = false) => (
    <button key={k} disabled={disabled} aria-pressed={on[k]} onClick={() => setOn({ ...on, [k]: !on[k] })}
      className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${on[k] ? "border-white/30 text-white" : "border-line text-muted"} disabled:opacity-40`}>
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />{label}
    </button>
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {toggle("spend", labels.spend, "#e5202e")}
        {toggle("results", labels.results, "#ffffff")}
        {toggle("revenue", labels.revenue, "#8b8b94", !showRevenue)}
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full touch-none" role="img" aria-label={labels.aria}
          onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * W; setHover(Math.max(0, Math.min(n - 1, Math.round(((px - M.l) / (W - M.l - M.r)) * (n - 1))))); }}
          onPointerLeave={() => setHover(null)}>
          {[0.25, 0.5, 0.75].map((g) => <line key={g} x1={M.l} x2={W - M.r} y1={M.t + g * (H - M.t - M.b)} y2={M.t + g * (H - M.t - M.b)} stroke="#232327" strokeDasharray="3 4" />)}
          {on.spend && <><path d={area} fill="#e5202e" opacity="0.12" /><path d={path((p) => p.spend, maxMoney)} fill="none" stroke="#e5202e" strokeWidth="2.2" strokeLinejoin="round" /></>}
          {on.revenue && <path d={path((p) => p.revenue, maxMoney)} fill="none" stroke="#8b8b94" strokeWidth="2" strokeDasharray="5 4" />}
          {on.results && <path d={path((p) => p.results, maxRes)} fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={M.t} y2={H - M.b} stroke="#fff" opacity="0.25" />}
          <text x={M.l} y={H - 6} fill="#8b8b94" fontSize="11">{series[0]?.date.slice(5)}</text>
          <text x={W - M.r} y={H - 6} fill="#8b8b94" fontSize="11" textAnchor="end">{series[n - 1]?.date.slice(5)}</text>
        </svg>
        {h && (
          <div className="pointer-events-none absolute top-2 rounded-lg border border-line bg-ink/95 px-3 py-2 text-xs shadow-lg"
            style={{ left: `${(x(hover!) / W) * 100}%`, transform: `translateX(${hover! > n / 2 ? "-105%" : "5%"})` }}>
            <p className="mb-1 font-semibold">{h.date}</p>
            <p className="text-zred">{labels.spend}: {fmt(h.spend)} {currency}</p>
            <p>{labels.results}: {fmt(h.results)}</p>
            {showRevenue && <p className="text-muted">{labels.revenue}: {fmt(h.revenue)} {currency}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
