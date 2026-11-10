import Link from "next/link";
import { db } from "@/lib/db";
import { parseFilters } from "@/lib/filters";
import { money, num, pct, ratio } from "@/lib/format";
import { hasRole, requireOrg } from "@/server/tenancy/context";
import { loadAds, loadFilterOptions, loadSummary } from "@/server/analytics/report";
import { Chart } from "@/components/ui/Chart";
import { ClassBadge, Delta, KpiCard } from "@/components/ui/bits";
import { FilterBar } from "@/components/FilterBar";
import { removeDemoAction, seedDemoAction } from "../demo-actions";

export const metadata = { title: "Panel — ZENTRA" };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function Dashboard({ searchParams }: { searchParams: SP }) {
  const ctx = await requireOrg();
  const f = parseFilters(await searchParams);
  const cur = ctx.organization.currency;
  const accounts = await db.adAccount.findMany({ where: { organizationId: ctx.organizationId }, select: { isDemo: true } });
  const canAdmin = hasRole(ctx.role, "ADMIN");

  if (accounts.length === 0) {
    return (
      <div className="animate-rise space-y-6">
        <h1 className="text-2xl font-bold">Hola, {ctx.user.name.split(" ")[0]}</h1>
        <div className="card p-6">
          <p className="text-lg font-semibold">Aún no hay datos publicitarios</p>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Podrás conectar tu cuenta de Meta Ads en la siguiente etapa. Mientras tanto, puedes explorar ZENTRA con datos de demostración
            (ficticios, siempre marcados como tales). Se pueden eliminar cuando quieras.
          </p>
          {canAdmin ? (
            <form action={seedDemoAction}><button className="btn mt-4">Cargar datos de demostración</button></form>
          ) : <p className="mt-4 text-sm text-muted">Pide a un administrador de tu organización que cargue los datos de demostración.</p>}
        </div>
      </div>
    );
  }

  const [options, summary, ads] = await Promise.all([loadFilterOptions(ctx.organizationId), loadSummary(ctx.organizationId, f), loadAds(ctx.organizationId, f)]);
  const d = summary.derived.current, dp = summary.derived.previous;
  const hasRevenue = summary.current.revenue > 0;
  const count = (fn: (a: (typeof ads)[number]) => boolean) => ads.filter(fn).length;
  const status = [
    ["Activos", count((a) => a.status === "ACTIVE")], ["Pausados", count((a) => a.status === "PAUSED")],
    ["Ganadores", count((a) => a.classification === "WINNER")], ["En observación", count((a) => a.classification === "WATCH")],
    ["Bajo rendimiento", count((a) => a.classification === "LOW" || a.classification === "LOSER")],
  ] as const;
  const withData = ads.filter((a) => a.totals.spend > 0);
  const best = withData.filter((a) => a.classification === "WINNER" || a.classification === "GOOD").sort((a, b) => (a.derived.costPerResult ?? 1e12) - (b.derived.costPerResult ?? 1e12)).slice(0, 4);
  const worst = withData.filter((a) => a.classification === "LOSER" || a.classification === "LOW").sort((a, b) => b.totals.spend - a.totals.spend).slice(0, 4);
  const link = (id: string) => `/ads?${new URLSearchParams({ range: f.rangeKey === "custom" ? "30" : f.rangeKey, ad: id })}`;

  return (
    <div className="animate-rise space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Panel</h1>
        <p className="text-sm text-muted">Resumen del período frente al período anterior de igual duración.</p>
      </div>
      <FilterBar action="/dashboard" f={f} options={options} />

      {!summary.hasData ? (
        <div className="card p-6 text-sm text-muted">No hay datos en este período con los filtros elegidos. Prueba ampliar el rango o limpiar los filtros.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-5">
            <KpiCard label="Inversión" value={money(summary.current.spend, cur)} delta={<Delta value={summary.deltas.spend} />} />
            <KpiCard label="Resultados" value={num(summary.current.results)} delta={<Delta value={summary.deltas.results} />} note="Según el objetivo de cada campaña" />
            <KpiCard label="Ingresos" value={hasRevenue ? money(summary.current.revenue, cur) : "—"} delta={hasRevenue ? <Delta value={summary.deltas.revenue} /> : undefined} note={hasRevenue ? undefined : "Sin ingresos informados"} />
            <KpiCard label="ROAS" value={d.roas !== null ? ratio(d.roas) : "—"} delta={d.roas !== null && dp.roas !== null ? <Delta value={summary.deltas.roas} /> : undefined} note={d.roas === null ? "Requiere ingresos" : undefined} />
            <KpiCard label="Costo por resultado" value={d.costPerResult !== null ? money(d.costPerResult, cur) : "—"} delta={<Delta value={summary.deltas.costPerResult} lowerIsBetter />} />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {status.map(([label, n]) => (
              <div key={label} className="card px-4 py-3"><p className="text-xs text-muted">{label}</p><p className="text-xl font-semibold">{n}</p></div>
            ))}
          </div>

          <section className="card p-4">
            <h2 className="mb-3 font-semibold">Evolución diaria</h2>
            <Chart series={summary.series} currency={cur} showRevenue={hasRevenue} />
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            {[["Mejores anuncios", best, "Aún no hay anuncios ganadores en este período."], ["Anuncios que pierden dinero", worst, "Ningún anuncio con bajo rendimiento. ¡Bien!"]].map(([title, list, empty]) => (
              <section key={title as string} className="card p-4">
                <h2 className="mb-3 font-semibold">{title as string}</h2>
                {(list as typeof best).length === 0 ? <p className="text-sm text-muted">{empty as string}</p> : (
                  <ul className="divide-y divide-line">
                    {(list as typeof best).map((a) => (
                      <li key={a.id}>
                        <Link href={link(a.id)} className="flex items-center justify-between gap-3 py-2.5 hover:text-zred">
                          <span className="min-w-0"><span className="block truncate text-sm font-medium">{a.name}</span>
                            <span className="block truncate text-xs text-muted">{a.campaignName} · {money(a.totals.spend, cur)} · CPR {a.derived.costPerResult !== null ? money(a.derived.costPerResult, cur) : "—"}</span></span>
                          <ClassBadge c={a.classification} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
          <p className="text-xs text-muted">CTR del período: {d.ctr !== null ? pct(d.ctr) : "—"} · CPM: {d.cpm !== null ? money(d.cpm, cur) : "—"} · CPC: {d.cpc !== null ? money(d.cpc, cur) : "—"}. La clasificación es básica (Fase 2): compara el costo por resultado de cada anuncio con la mediana de su objetivo y no juzga con datos insuficientes.</p>
        </>
      )}

      {canAdmin && accounts.some((a) => a.isDemo) && (
        <form action={removeDemoAction}><button className="text-xs text-muted underline hover:text-white">Eliminar datos de demostración</button></form>
      )}
    </div>
  );
}
