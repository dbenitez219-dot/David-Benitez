import { supabase } from './supabase';

export type Exercise = {
  id: string; name: string; kind: 'strength' | 'cardio' | 'mobility' | 'core'; muscle: string; equipment: string[];
  level: string; unit: 'reps' | 'seconds' | 'minutes'; instructions: string[]; tips: string | null; media_url: string | null;
};
let cache: Map<string, Exercise> | null = null;
export async function getCatalog(): Promise<Map<string, Exercise>> {
  if (cache) return cache;
  const { data, error } = await supabase.from('exercises').select('*');
  if (error) throw error;
  cache = new Map((data as Exercise[]).map((e) => [e.id, e]));
  return cache;
}

/** Equipamiento disponible (en gimnasio se asume todo). Espejo de `availableEquipment` del servidor. */
export function equipmentSet(place: string | null | undefined, equipment: string[]): Set<string> {
  const all = ['dumbbells', 'bands', 'barbell', 'machines', 'kettlebell', 'bench', 'pullup'];
  if (place === 'gym') return new Set(all);
  const s = new Set(equipment);
  if (place === 'both') all.forEach((e) => s.add(e));
  return s;
}
