// Búsqueda de países sin dependencias pesadas (se usa también en el navegador).
export type CountryInfo = { code: string; name: string; dial: string; flag: string };

/** Quita acentos y pasa a minúsculas (búsqueda tolerante). */
export const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Busca por nombre, código ISO o prefijo telefónico (+595 / 595). */
export function searchCountries(list: CountryInfo[], query: string): CountryInfo[] {
  const q = normalize(query).replace(/^\+/, "");
  if (!q) return list;
  const isNum = /^\d+$/.test(q);
  return list.filter((c) => (isNum ? c.dial.slice(1).startsWith(q) : normalize(c.name).includes(q) || c.code.toLowerCase() === q));
}
