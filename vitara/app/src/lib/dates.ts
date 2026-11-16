const pad = (n: number) => String(n).padStart(2, '0');
export const localDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const nowHHMM = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return localDate(d); };
