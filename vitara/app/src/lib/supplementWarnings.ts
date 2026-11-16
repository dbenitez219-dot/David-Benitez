// Avisos conservadores a partir de la base curada (supplement_knowledge). No es consejo médico.
export type Knowledge = { slug: string; aliases: string[]; summary: string; cautions: string; watch_terms: string[]; always_consult: boolean };
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function findKnowledge(name: string, kb: Knowledge[]): Knowledge | null {
  const n = norm(name);
  if (n.trim().length < 3) return null;
  return kb.find((k) => k.aliases.some((a) => n.includes(norm(a)) || (norm(a).includes(n) && n.length >= 4))) ?? null;
}

export type Warning = { level: 'info' | 'caution' | 'consult'; text: string };

/** `medications` / `conditions`: texto libre del usuario (solo si autorizó el uso de datos de salud). */
export function warningsFor(k: Knowledge | null, medications: string | null, conditions: string | null, healthAuthorized: boolean): Warning[] {
  if (!k) return [{ level: 'consult', text: 'No tengo información verificada sobre este suplemento. Consulta a un profesional de la salud antes de usarlo, sobre todo si tomas medicamentos o tienes alguna condición.' }];
  const out: Warning[] = [{ level: 'caution', text: k.cautions }];
  if (!healthAuthorized) {
    out.push({ level: 'consult', text: 'No tengo tus medicamentos ni condiciones (no los cargaste o no autorizaste su uso), así que no puedo revisar interacciones. Consulta a un profesional.' });
  } else {
    const hay = norm(`${medications ?? ''} ${conditions ?? ''}`);
    const hits = k.watch_terms.filter((t) => hay.includes(norm(t)));
    if (hits.length) out.push({ level: 'consult', text: `Lo que indicaste en tu salud (${[...new Set(hits)].join(', ')}) puede interactuar con este suplemento. Consulta a tu médico antes de usarlo.` });
    else if (!medications?.trim() && !conditions?.trim()) out.push({ level: 'info', text: 'No registraste medicamentos ni condiciones. Si cambia algo, actualiza tu evaluación.' });
  }
  if (k.always_consult) out.push({ level: 'consult', text: 'Se recomienda consultar con un profesional antes de usarlo, independientemente de tu situación.' });
  return out;
}
