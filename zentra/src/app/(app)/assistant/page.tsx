import { db } from "@/lib/db";
import { requireOrg } from "@/server/tenancy/context";
import { SUGGESTED } from "@/server/ai/rules";
import { AskForm } from "@/components/AskForm";
import { askAction } from "./actions";

export const metadata = { title: "ZENTRA AI — ZENTRA" };

export default async function Assistant() {
  const ctx = await requireOrg();
  const logs = await db.assistantLog.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { createdAt: "desc" }, take: 15 });
  const aiOn = Boolean(process.env.ANTHROPIC_API_KEY);
  return (
    <div className="animate-rise space-y-6">
      <div>
        <h1 className="text-2xl font-bold">ZENTRA AI</h1>
        <p className="text-sm text-muted">Pregúntale a tus datos reales. Explica sus conclusiones, distingue lo comprobado de lo estimado y nunca cambia nada en tus cuentas.</p>
      </div>
      <p className={`rounded-xl border px-4 py-2 text-sm ${aiOn ? "border-emerald-500/30 bg-emerald-500/10" : "border-line bg-panel text-muted"}`}>
        {aiOn ? "Modo IA activo." : "Modo básico (sin IA): respondo las preguntas frecuentes con reglas sobre tus datos. Para conversar libremente hay que configurar ANTHROPIC_API_KEY en el servidor."}
      </p>
      <div className="card p-4"><AskForm action={askAction} suggestions={SUGGESTED} /></div>
      <p className="text-xs text-muted">✅ Dato comprobado = viene de tu cuenta · 📐 Estimación = cálculo de ZENTRA · 💡 Recomendación = sugerencia, tú decides.</p>

      <section className="space-y-4">
        {logs.length === 0 && <p className="text-sm text-muted">Aún no hiciste preguntas.</p>}
        {logs.map((l) => {
          const calls = (l.toolCalls as { name: string; input: unknown; output: unknown }[]) ?? [];
          return (
            <article key={l.id} className="card p-4">
              <p className="text-sm font-semibold">{l.question}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{l.answer}</p>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted">
                <span>{l.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC</span>
                <span>{l.mode === "ai" ? `IA · ${l.model}` : "Reglas (sin IA)"}</span>
              </div>
              {calls.length > 0 && (
                <details className="mt-2 text-xs text-muted">
                  <summary className="cursor-pointer hover:text-white">Ver datos consultados ({calls.length})</summary>
                  <div className="mt-2 space-y-2">
                    {calls.map((c, i) => (
                      <div key={i}><p className="font-mono text-white">{c.name}({JSON.stringify(c.input)})</p>
                        <pre className="mt-1 max-h-60 overflow-auto rounded-lg bg-ink p-3 text-[11px]">{JSON.stringify(c.output, null, 2)}</pre></div>
                    ))}
                  </div>
                </details>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}
