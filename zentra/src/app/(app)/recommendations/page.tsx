import { parseFilters } from "@/lib/filters";
import { requireOrg } from "@/server/tenancy/context";
import { buildRecommendations, type Severity } from "@/server/analytics/recommendations";
import { loadAds } from "@/server/analytics/report";
import { getAnalysisConfig } from "@/server/analytics/settings";
import Link from "next/link";

export const metadata = { title: "Recomendaciones — ZENTRA" };
const SEV: Record<Severity, [string, string]> = { high: ["Importante", "border-zred/50 text-red-300"], medium: ["Atención", "border-amber-500/40 text-amber-300"], info: ["Informativo", "border-line text-muted"] };

export default async function Recommendations({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireOrg();
  const f = parseFilters({ range: (await searchParams).range ?? "30" });
  const [ads, cfg] = await Promise.all([loadAds(ctx.organizationId, f), getAnalysisConfig(ctx.organizationId)]);
  const recs = buildRecommendations(ads, cfg, ctx.organization.currency);
  return (
    <div className="animate-rise space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Recomendaciones</h1>
        <p className="text-sm text-muted">Calculadas con tus propios criterios (<Link href="/settings/analysis" className="underline">ajustar</Link>). Solo recomiendan: ZENTRA no cambia nada sin tu autorización.</p>
      </div>
      <div className="flex gap-2 text-sm">
        {["7", "14", "30", "60"].map((r) => <Link key={r} href={`/recommendations?range=${r}`} className={`rounded-full border px-3 py-1 ${f.rangeKey === r ? "border-zred bg-zred/15" : "border-line text-muted hover:text-white"}`}>{r} días</Link>)}
      </div>
      {recs.length === 0 ? <p className="card p-6 text-sm text-muted">No hay recomendaciones con los datos de este período.</p> : (
        <div className="space-y-3">
          {recs.map((r) => (
            <article key={r.id} className="card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-xs ${SEV[r.severity][1]}`}>{SEV[r.severity][0]}</span>
                <h2 className="font-semibold">{r.title}</h2>
              </div>
              <p className="mt-1 text-xs text-muted">{r.campaignName}</p>
              <p className="mt-2 text-sm">{r.explanation}</p>
              <p className="mt-2 text-sm">💡 {r.suggestedAction}</p>
              <details className="mt-2 text-xs text-muted">
                <summary className="cursor-pointer hover:text-white">Ver evidencia</summary>
                <ul className="mt-2 space-y-1">{r.evidence.map((e) => <li key={e.label}>{e.type === "comprobado" ? "✅" : "📐"} {e.label}: <span className="text-white">{e.value}</span> <span className="opacity-60">({e.type === "comprobado" ? "comprobado" : "estimación"})</span></li>)}</ul>
              </details>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
