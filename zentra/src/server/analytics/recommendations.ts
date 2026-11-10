import { money, num } from "@/lib/format";
import type { AdRow } from "./report";
import type { AnalysisConfig } from "./settings";

export type Severity = "high" | "medium" | "info";
export type Kind = "PAUSE_CANDIDATE" | "WATCH" | "SCALE_CANDIDATE" | "FATIGUE" | "ANOMALY" | "DATA";
/** Cada dato se etiqueta: "comprobado" (viene de la plataforma) o "estimación" (calculado por ZENTRA). */
export type Evidence = { label: string; value: string; type: "comprobado" | "estimacion" };

export type Recommendation = {
  id: string; kind: Kind; severity: Severity; adId: string; adName: string; campaignName: string;
  title: string; explanation: string; suggestedAction: string; evidence: Evidence[];
};

/** Un día con gasto muy superior al promedio de los 7 días anteriores (requiere ≥7 días previos con gasto). */
export function detectSpendAnomaly(series: { date: string; spend: number }[], factor: number) {
  if (series.length < 8) return null;
  const last = series[series.length - 1];
  const prior = series.slice(-8, -1).filter((p) => p.spend > 0);
  if (prior.length < 7) return null;
  const avg = prior.reduce((a, b) => a + b.spend, 0) / prior.length;
  return avg > 0 && last.spend >= avg * factor ? { date: last.date, spend: last.spend, average: avg, ratio: last.spend / avg } : null;
}

const dailyAvg = (a: AdRow) => (a.activeDays > 0 ? a.totals.spend / a.activeDays : 0);

/**
 * Solo RECOMIENDA: nada de esto ejecuta cambios. Las acciones reales requieren el modo
 * asistido/automático y la autorización del cliente (Fase 5).
 */
export function buildRecommendations(ads: AdRow[], cfg: AnalysisConfig, currency: string): Recommendation[] {
  const out: Recommendation[] = [];
  const base = (a: AdRow) => ({ adId: a.id, adName: a.name, campaignName: a.campaignName });
  const cpr = (a: AdRow) => (a.derived.costPerResult !== null ? money(a.derived.costPerResult, currency) : "—");
  const core = (a: AdRow): Evidence[] => [
    { label: "Gasto en el período", value: money(a.totals.spend, currency), type: "comprobado" },
    { label: "Resultados", value: num(a.totals.results), type: "comprobado" },
    { label: "Costo por resultado", value: cpr(a), type: "comprobado" },
    ...(a.reference ? [{ label: a.refKind === "target" ? "Tu costo objetivo" : "Mediana de tus anuncios", value: money(a.reference, currency), type: "comprobado" as const }] : []),
    { label: "Días con actividad", value: String(a.activeDays), type: "comprobado" },
  ];

  for (const a of ads) {
    const active = a.status === "ACTIVE";
    if (a.classification === "LOSER" && active) {
      out.push({ ...base(a), id: `pause:${a.id}`, kind: "PAUSE_CANDIDATE", severity: "high", title: `Considera pausar «${a.name}»`,
        explanation: a.reason, suggestedAction: "Revisa el anuncio y, si estás de acuerdo, páusalo o cambia su creativo. ZENTRA no lo pausa por sí solo.",
        evidence: [...core(a), { label: "Gasto proyectado a 30 días si sigue igual", value: money(dailyAvg(a) * 30, currency), type: "estimacion" }] });
    } else if (a.classification === "LOW" && active) {
      out.push({ ...base(a), id: `watch:${a.id}`, kind: "WATCH", severity: "medium", title: `«${a.name}» rinde por debajo de lo esperado`,
        explanation: a.reason, suggestedAction: "Obsérvalo unos días más; si no mejora, prueba otro creativo o público.", evidence: core(a) });
    } else if (a.classification === "WINNER" && active) {
      out.push({ ...base(a), id: `scale:${a.id}`, kind: "SCALE_CANDIDATE", severity: "info", title: `«${a.name}» es un anuncio ganador`,
        explanation: a.reason, suggestedAction: "Si quieres crecer, sube su presupuesto de forma gradual (p. ej. 10–20%) y vigila el costo. ZENTRA no aumenta presupuestos automáticamente.", evidence: core(a) });
    } else if (a.classification === "INSUFFICIENT_DATA" && active && a.totals.spend > 0) {
      out.push({ ...base(a), id: `data:${a.id}`, kind: "DATA", severity: "info", title: `«${a.name}» aún no tiene datos suficientes`,
        explanation: a.reason, suggestedAction: "Espera antes de decidir: juzgarlo ahora sería precipitado.", evidence: [{ label: "Gasto en el período", value: money(a.totals.spend, currency), type: "comprobado" }] });
    }
    if (active && a.derived.frequency !== null && a.derived.frequency > cfg.maxFrequency && a.trend === "DOWN") {
      out.push({ ...base(a), id: `fatigue:${a.id}`, kind: "FATIGUE", severity: "medium", title: `«${a.name}» puede estar cansando a la audiencia`,
        explanation: `La frecuencia (${a.derived.frequency.toFixed(2)}, aproximada) supera tu límite de ${cfg.maxFrequency} y su eficiencia viene bajando.`,
        suggestedAction: "Renueva el creativo o amplía el público.", evidence: [{ label: "Frecuencia (aprox.)", value: a.derived.frequency.toFixed(2), type: "comprobado" }, { label: "Tendencia", value: "empeora", type: "estimacion" }] });
    }
    const an = detectSpendAnomaly(a.series, cfg.anomalyFactor);
    if (an) {
      out.push({ ...base(a), id: `anomaly:${a.id}`, kind: "ANOMALY", severity: "high", title: `Gasto inusual en «${a.name}»`,
        explanation: `El ${an.date} gastó ${an.ratio.toFixed(1)} veces su promedio de los 7 días anteriores.`,
        suggestedAction: "Revisa si cambiaste el presupuesto o si hay un problema de entrega.",
        evidence: [{ label: `Gasto ${an.date}`, value: money(an.spend, currency), type: "comprobado" }, { label: "Promedio previo (7 días)", value: money(an.average, currency), type: "comprobado" }] });
    }
  }
  const rank = { high: 0, medium: 1, info: 2 } as const;
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || a.adName.localeCompare(b.adName));
}
