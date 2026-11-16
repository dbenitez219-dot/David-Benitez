// Lógica pura de horarios para recordatorios (probada con Node, usada por send-reminders en Deno).
export type Local = { date: string; hhmm: string; weekday: number; minutes: number };

/** Fecha/hora local de un usuario según su zona horaria. weekday: 1=lunes … 7=domingo. */
export function localParts(now: Date, timeZone: string): Local {
  let tz = timeZone;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); } catch { tz = 'UTC'; }
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' });
  const parts = Object.fromEntries(f.formatToParts(now).map((p) => [p.type, p.value]));
  const wd = ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 } as Record<string, number>)[parts.weekday] ?? 1;
  const hhmm = `${parts.hour}:${parts.minute}`;
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hhmm, weekday: wd, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}
export const toMinutes = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

/** ¿Ya pasó `at` (+offset) y estamos dentro de la ventana de gracia? El cron corre cada minuto; la ventana tolera retrasos. */
export function isDue(local: Local, at: string, offsetMin = 0, windowMin = 5): boolean {
  const diff = local.minutes - (toMinutes(at) + offsetMin);
  return diff >= 0 && diff < windowMin;
}

export function isPaused(s?: { enabled: boolean; paused_until: string | null } | null, now = new Date()): boolean {
  if (!s) return false; // sin fila = valores por defecto (activo)
  if (!s.enabled) return true;
  return !!s.paused_until && new Date(s.paused_until).getTime() > now.getTime();
}

export const DEFAULT_WATER_TIMES = ['10:00', '12:30', '15:00', '17:30', '20:00'];
export const MEAL_NAMES: Record<string, string> = { breakfast: 'desayunar', lunch: 'almorzar', snack: 'merendar', dinner: 'cenar' };
