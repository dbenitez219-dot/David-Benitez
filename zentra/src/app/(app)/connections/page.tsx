import { db } from "@/lib/db";
import { getFormatter } from "@/lib/locale";
import { hasRole, requireOrg } from "@/server/tenancy/context";
import { metaConfig } from "@/server/integrations/meta/config";
import { maxSyncedAccounts } from "@/server/integrations/meta/limits";
import { DemoTag } from "@/components/ui/bits";
import { disconnectAction, syncNowAction, toggleSyncAction } from "./actions";

export const metadata = { title: "Conexiones — ZENTRA" };

const STATUS: Record<string, [string, string]> = {
  ACTIVE: ["Conectada", "text-emerald-400"], EXPIRED: ["Requiere reconectar", "text-amber-300"],
  REVOKED: ["Desconectada", "text-muted"], ERROR: ["Con error", "text-red-400"],
};
const MESSAGES: Record<string, string> = {
  not_configured: "La integración con Meta aún no está configurada en el servidor (faltan META_APP_ID y META_APP_SECRET).",
  denied: "Cancelaste la autorización en Meta. No se conectó nada.",
  state: "La verificación de seguridad falló. Inténtalo de nuevo desde el botón «Conectar Meta».",
  failed: "No se pudo completar la conexión con Meta. Inténtalo de nuevo; si persiste, revisa la configuración de la app.",
};

export default async function Connections({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireOrg();
  const { dateLong } = await getFormatter();
  const sp = await searchParams;
  const canAdmin = hasRole(ctx.role, "ADMIN");
  const cfg = metaConfig();
  const [accounts, max] = await Promise.all([
    db.adAccount.findMany({ where: { organizationId: ctx.organizationId }, orderBy: [{ isDemo: "asc" }, { name: "asc" }] }),
    maxSyncedAccounts(ctx.organizationId),
  ]);
  const enabled = accounts.filter((a) => !a.isDemo && a.syncEnabled).length;

  return (
    <div className="animate-rise space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Conexiones</h1>
        <p className="text-sm text-muted">Conecta tus cuentas publicitarias. ZENTRA solo pide permiso de lectura y nunca guarda tu contraseña de Facebook.</p>
      </div>

      {sp.connected && <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm">Meta conectado: {sp.connected} cuenta(s) publicitaria(s) encontradas. Activa la sincronización de las que quieras usar.</p>}
      {sp.error && <p role="alert" className="rounded-xl border border-zred/40 bg-zred/10 px-4 py-2 text-sm text-red-200">{MESSAGES[sp.error] ?? "Ocurrió un error."}</p>}

      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Meta Ads (Facebook e Instagram)</h2>
            <p className="text-sm text-muted">Sincronización de campañas, conjuntos, anuncios y estadísticas diarias.</p>
          </div>
          {canAdmin && cfg.configured && <a href="/api/meta/connect" className="btn">Conectar Meta</a>}
        </div>
        {!cfg.configured && (
          <div className="mt-4 rounded-lg border border-line bg-ink p-4 text-sm text-muted">
            <p className="font-medium text-white">La conexión real todavía no está habilitada</p>
            <p className="mt-1">Falta crear la app en Meta for Developers y cargar <code>META_APP_ID</code> y <code>META_APP_SECRET</code> en el servidor. Los pasos están en <code>docs/04-META-ADS.md</code>.</p>
          </div>
        )}
        <p className="mt-4 text-xs text-muted">Sincronización activa: {enabled} de {max} permitidas por tu plan.</p>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Cuentas publicitarias</h2>
        {accounts.length === 0 && <p className="card p-5 text-sm text-muted">Todavía no hay cuentas.</p>}
        {accounts.map((a) => {
          const [label, color] = STATUS[a.status];
          return (
            <article key={a.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-medium">{a.name} {a.isDemo && <DemoTag />}</h3>
                  <p className="text-xs text-muted">{a.isDemo ? "Datos ficticios" : `${a.externalId} · ${a.currency ?? "—"}`}</p>
                  <p className={`mt-1 text-sm ${color}`}>● {label}{!a.isDemo && (a.syncEnabled ? " · sincronización activa" : " · sincronización desactivada")}</p>
                  {!a.isDemo && <p className="text-xs text-muted">{a.lastSyncAt ? `Última sincronización: ${dateLong(a.lastSyncAt)}` : "Aún no sincronizada"}{a.tokenExpiresAt ? ` · Permiso vence: ${dateLong(a.tokenExpiresAt)}` : ""}</p>}
                  {a.lastError && <p className="mt-1 text-xs text-red-300">Último error: {a.lastError}</p>}
                </div>
                {canAdmin && !a.isDemo && (
                  <div className="flex flex-wrap gap-2">
                    {a.status !== "REVOKED" && (
                      <form action={toggleSyncAction}>
                        <input type="hidden" name="id" value={a.id} /><input type="hidden" name="enable" value={a.syncEnabled ? "0" : "1"} />
                        <button className="btn btn-ghost !py-1.5 text-sm" disabled={!a.syncEnabled && enabled >= max} title={!a.syncEnabled && enabled >= max ? "Alcanzaste el límite de tu plan" : undefined}>{a.syncEnabled ? "Desactivar" : "Activar sincronización"}</button>
                      </form>
                    )}
                    {a.syncEnabled && <form action={syncNowAction}><input type="hidden" name="id" value={a.id} /><button className="btn !py-1.5 text-sm">Sincronizar ahora</button></form>}
                    {a.status !== "REVOKED" && <form action={disconnectAction}><input type="hidden" name="id" value={a.id} /><button className="btn btn-ghost !py-1.5 text-sm">Desconectar</button></form>}
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
