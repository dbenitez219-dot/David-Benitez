// Sobrecarga progresiva determinista (doble progresión). Sin IA: reglas simples y predecibles.
export type LoggedSet = { weight_kg: number | null; reps: number | null };
export type Suggestion = { weight_kg: number | null; reps: number; reason: 'first_time' | 'increase_weight' | 'add_reps' | 'keep' | 'reduce' };

export function suggestNext(last: LoggedSet[], repsMin: number, repsMax: number, lowerBody: boolean): Suggestion | null {
  const done = last.filter((s) => s.reps != null && s.reps > 0);
  if (!done.length) return null;
  const weight = done.reduce((m, s) => Math.max(m, s.weight_kg ?? 0), 0) || null; // peso de trabajo = el mayor usado
  const atWeight = weight == null ? done : done.filter((s) => (s.weight_kg ?? 0) === weight);
  if (weight == null) {
    // Peso corporal / duración: subir repeticiones hasta el máximo.
    const best = Math.min(...done.map((s) => s.reps!));
    return { weight_kg: null, reps: Math.min(repsMax, best + 1), reason: best >= repsMax ? 'keep' : 'add_reps' };
  }
  const allTop = atWeight.length >= 1 && atWeight.every((s) => s.reps! >= repsMax);
  if (allTop) return { weight_kg: Math.round((weight + (lowerBody ? 5 : 2.5)) * 2) / 2, reps: repsMin, reason: 'increase_weight' };
  const struggled = atWeight.some((s) => s.reps! < Math.max(1, repsMin - 2));
  if (struggled) return { weight_kg: Math.round(weight * 0.95 * 2) / 2, reps: repsMin, reason: 'reduce' };
  const worst = Math.min(...atWeight.map((s) => s.reps!));
  return { weight_kg: weight, reps: Math.min(repsMax, Math.max(repsMin, worst + 1)), reason: 'add_reps' };
}
