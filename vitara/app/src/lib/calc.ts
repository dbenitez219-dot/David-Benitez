// Cálculos orientativos. Nunca son diagnóstico médico.

export function parseDate(input: string): string | null {
  const m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(input.trim());
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  if (dt.getTime() >= Date.now() || y < 1900) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
export function formatDate(iso?: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
export function ageFrom(iso?: string | null, now = new Date()): number | null {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--;
  return age;
}
export function num(input: string): number | null {
  const n = Number(input.trim().replace(',', '.'));
  return input.trim() !== '' && Number.isFinite(n) ? n : null;
}
export function csv(input: string): string[] {
  return [...new Set(input.split(',').map((s) => s.trim()).filter(Boolean))];
}
export function validTime(s: string): boolean { return /^([01]\d|2[0-3]):[0-5]\d$/.test(s); }

/** Objetivo de agua orientativo: ~35 ml/kg, acotado a 1,5–4 L. */
export function hydrationTargetMl(weightKg?: number | null): number | null {
  if (!weightKg) return null;
  return Math.round(Math.min(4000, Math.max(1500, weightKg * 35)) / 50) * 50;
}
/** Día de la semana ISO de hoy: 1=lunes … 7=domingo. */
export function isoWeekday(d = new Date()): number { return ((d.getDay() + 6) % 7) + 1; }
