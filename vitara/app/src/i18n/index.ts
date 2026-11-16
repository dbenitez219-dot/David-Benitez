import { es, type Dict } from './es';
// Para añadir un idioma: crear `en.ts` con la forma de `Dict` y registrarlo aquí.
const dictionaries: Record<string, Dict> = { es };
let current = 'es';
export function setLocale(l: string) { if (dictionaries[l]) current = l; }
export const tr = (): Dict => dictionaries[current];
export const fmt = (s: string, vars: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
