import { money, num, pct } from "@/lib/format";

type Run = (name: string, input: unknown) => Promise<any>;
export type ToolCall = { name: string; input: unknown; output: unknown };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const OK = "✅ Dato comprobado";
const EST = "📐 Estimación";
const REC = "💡 Recomendación";

export const SUGGESTED = [
  "¿Cuánto gasté esta semana?", "¿Qué anuncio funciona mejor?", "¿Cuál está perdiendo dinero?", "¿Qué anuncio debería pausar?",
  "¿Qué campaña debería optimizar?", "¿Dónde estoy invirtiendo demasiado?", "¿Cuál es mi costo por cliente?", "¿Qué campaña genera más ventas?",
];

function periodOf(q: string): number {
  if (/\bhoy\b/.test(q)) return 1;
  const n = q.match(/(\d{1,2})\s*dias/); if (n) return Math.min(90, Math.max(1, Number(n[1])));
  if (/quincena/.test(q)) return 15;
  if (/\bmes\b|mensual/.test(q)) return 30;
  return 7;
}

/**
 * Asistente SIN IA: responde las preguntas frecuentes con reglas sobre las mismas herramientas de datos.
 * Es honesto sobre su alcance: si no entiende la pregunta, lo dice y sugiere las que sí puede responder.
 */
export async function answerWithRules(question: string, run: Run, currency: string): Promise<{ text: string; toolCalls: ToolCall[] }> {
  const calls: ToolCall[] = [];
  const call = async (name: string, input: Record<string, unknown>) => { const output = await run(name, input); calls.push({ name, input, output }); return output; };
  const q = norm(question), days = periodOf(q), m = (n: number | null | undefined) => (n === null || n === undefined ? "—" : money(n, currency));
  const demo = (o: any) => (o?.data?.ads?.some?.((a: any) => a.is_demo) ? "\n\n(Estos son datos de demostración, no de una cuenta real.)" : "");

  if (/demasiado|invirtiendo|sobreinvert/.test(q)) {
    const o = await call("list_campaigns", { days });
    const cs = (o.data.campaigns as any[]).filter((c) => c.spend);
    if (!cs.length) return { text: `No hay datos de gasto en los últimos ${days} días.`, toolCalls: calls };
    const medianCpr = [...cs.filter((c) => c.cost_per_result).map((c) => c.cost_per_result)].sort((a, b) => a - b);
    const lines = cs.map((c) => `• ${c.name}: ${m(c.spend)} (${c.share_of_spend_pct}% de tu inversión), ${num(c.results)} resultados, costo por resultado ${m(c.cost_per_result)}`);
    return { text: `${OK} — Inversión por campaña, últimos ${days} días:\n${lines.join("\n")}\n\n${REC}: no se puede decir "demasiado" sin comparar objetivos distintos. Mira las campañas con mucha inversión y pocos resultados (o costo por resultado alto) y pregúntame por «¿Qué campaña debería optimizar?».${medianCpr.length ? "" : ""}`, toolCalls: calls };
  }
  if (/pausar|perdiendo|pierde|perdedor|peor|desperdici/.test(q)) {
    const o = await call("get_recommendations", { days: Math.max(days, 14) });
    const recs = (o.data.recommendations as any[]).filter((x) => x.kind === "PAUSE_CANDIDATE" || x.kind === "WATCH" || x.kind === "ANOMALY");
    if (!recs.length) return { text: `${OK} — No hay anuncios con rendimiento claramente malo y datos suficientes ahora mismo. Los anuncios con pocos datos no se juzgan para no decidir de forma precipitada.`, toolCalls: calls };
    const lines = recs.slice(0, 5).map((x) => `• ${x.title}\n   ${x.why}\n   ${REC}: ${x.suggested_action}`);
    return { text: `${OK} — Anuncios a revisar (últimos ${Math.max(days, 14)} días):\n${lines.join("\n")}\n\nZENTRA solo recomienda; tú decides si pausar.`, toolCalls: calls };
  }
  if (/ventas|vende|ingresos|roas|rentab/.test(q)) {
    const o = await call("list_campaigns", { days: days === 7 ? 30 : days });
    const cs = (o.data.campaigns as any[]).filter((c) => c.revenue);
    if (!cs.length) return { text: `No hay ingresos informados por la plataforma en este período, así que no puedo decir qué campaña genera más ventas. Ojo: un mensaje o un lead no es una venta. Cuando registres tus ventas reales (módulo comercial, próxima etapa) podré medirlo con exactitud.`, toolCalls: calls };
    const best = [...cs].sort((a, b) => b.revenue - a.revenue);
    return { text: `${OK} — Ingresos de compras informados por la plataforma (${o.period.from} a ${o.period.to}):\n${best.map((c) => `• ${c.name}: ${m(c.revenue)} de ingresos con ${m(c.spend)} de inversión (ROAS ${c.roas ?? "—"}x)`).join("\n")}\n\nNota: son compras que reporta la plataforma, no ventas registradas por ti.`, toolCalls: calls };
  }
  if (/costo por (cliente|resultado|lead|mensaje|venta|adquisicion)|\bcpa\b|\bcpr\b|cuesta (cada|un) (cliente|lead)/.test(q)) {
    const o = await call("get_account_summary", { days: days === 7 ? 30 : days });
    const c = o.data.current;
    if (!o.data.has_data || c.cost_per_result === null) return { text: "No hay resultados suficientes en el período para calcular el costo por resultado.", toolCalls: calls };
    return { text: `${OK} — Costo por resultado (${o.period.from} a ${o.period.to}): ${m(c.cost_per_result)} (${num(c.results)} resultados con ${m(c.spend)} de inversión).\n\nImportante: "resultado" es lo que cada campaña persigue (mensajes, leads o compras). No es lo mismo que un cliente que paga; para el costo real por cliente necesito tus ventas registradas (próxima etapa).`, toolCalls: calls };
  }
  if (/optimiz/.test(q)) {
    const [c, r] = [await call("list_campaigns", { days: Math.max(days, 14) }), await call("get_recommendations", { days: Math.max(days, 14) })];
    const recs = r.data.recommendations as any[];
    const worstByAd = new Map<string, number>(); for (const x of recs) if (x.kind === "PAUSE_CANDIDATE" || x.kind === "WATCH") worstByAd.set(x.campaign, (worstByAd.get(x.campaign) ?? 0) + 1);
    const ranked = [...worstByAd.entries()].sort((a, b) => b[1] - a[1]);
    if (!ranked.length) return { text: `${OK} — No veo campañas con anuncios problemáticos y datos suficientes. ${REC}: deja que acumulen datos antes de optimizar.`, toolCalls: calls };
    const camp = (c.data.campaigns as any[]).find((x) => x.name === ranked[0][0]);
    return { text: `${OK} — La campaña con más anuncios para revisar es «${ranked[0][0]}» (${ranked[0][1]} anuncio(s) con bajo rendimiento)${camp ? `; invirtió ${m(camp.spend)} con costo por resultado ${m(camp.cost_per_result)}` : ""}.\n\n${recs.filter((x) => x.campaign === ranked[0][0] && (x.kind === "PAUSE_CANDIDATE" || x.kind === "WATCH")).map((x) => `• ${x.title}: ${x.why}`).join("\n")}\n\n${REC}: empieza por esos anuncios.`, toolCalls: calls };
  }
  if (/gaste|gasto|inversion|cuanto invert|cuanto he gastado/.test(q)) {
    const o = await call("get_account_summary", { days });
    const c = o.data.current, ch = o.data.change_pct.spend;
    if (!o.data.has_data) return { text: `No hay datos de gasto en los últimos ${days} días.`, toolCalls: calls };
    return { text: `${OK} — Gastaste ${m(c.spend)} entre ${o.period.from} y ${o.period.to}${ch !== null ? ` (${ch >= 0 ? "+" : ""}${pct(ch, 1)} frente al período anterior)` : ""}. Obtuviste ${num(c.results)} resultados${c.cost_per_result !== null ? ` a ${m(c.cost_per_result)} cada uno` : ""}.`, toolCalls: calls };
  }
  if (/mejor|funciona|ganador|gana|rinde/.test(q)) {
    const o = await call("list_ads", { days: days === 7 ? 30 : days, sort_by: "cost_per_result", status: "ACTIVE", limit: 15 });
    const good = (o.data.ads as any[]).filter((a) => a.classification === "WINNER" || a.classification === "GOOD").slice(0, 3);
    if (!good.length) return { text: `${OK} — Todavía no hay anuncios claramente ganadores con datos suficientes.${demo(o)}`, toolCalls: calls };
    return { text: `${OK} — Mejores anuncios activos (${o.period.from} a ${o.period.to}):\n${good.map((a: any) => `• ${a.name} (${a.campaign}): ${num(a.results)} resultados a ${m(a.cost_per_result)} cada uno. ${a.why}`).join("\n")}\n\n${REC}: puedes darles más presupuesto de forma gradual; ZENTRA no lo hace sola.${demo(o)}`, toolCalls: calls };
  }
  return { text: `No estoy seguro de entender esa pregunta. Sin el modo de IA activado solo puedo responder preguntas como:\n${SUGGESTED.map((s) => `• ${s}`).join("\n")}`, toolCalls: calls };
}
