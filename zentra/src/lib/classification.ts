import type { AdClassification } from "@prisma/client";

export const CLASS_LABEL: Record<AdClassification, string> = {
  WINNER: "Ganador",
  GOOD: "Buen rendimiento",
  WATCH: "En observación",
  LOW: "Bajo rendimiento",
  LOSER: "Perdedor",
  INSUFFICIENT_DATA: "Datos insuficientes",
};

export const CLASS_STYLE: Record<AdClassification, string> = {
  WINNER: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  GOOD: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  WATCH: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  LOW: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  LOSER: "bg-zred/15 text-red-300 border-zred/40",
  INSUFFICIENT_DATA: "bg-white/5 text-muted border-line",
};

export const OBJECTIVE_LABEL: Record<string, string> = { MESSAGES: "Mensajes", LEADS: "Leads", SALES: "Ventas" };
