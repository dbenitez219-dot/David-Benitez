import { db } from "@/lib/db";
import { reportError } from "@/lib/monitor";

/** Tareas programadas y cada cuánto deberían correr (para detectar las que dejaron de ejecutarse). */
export const JOBS = { sync: { label: "Sincronización con Meta", everyHours: 3 }, automation: { label: "Evaluación de reglas y avisos", everyHours: 3 }, billing: { label: "Ciclo de facturación", everyHours: 24 } } as const;
export type JobName = keyof typeof JOBS;

/** Ejecuta una tarea dejando constancia de cuándo corrió, si funcionó y qué hizo. Un fallo se registra, se alerta y se relanza. */
export async function runJob<T extends object>(name: JobName, fn: () => Promise<T>): Promise<T> {
  const run = await db.jobRun.create({ data: { name } });
  try {
    const summary = await fn();
    await db.jobRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), ok: true, summary: summary as object } });
    return summary;
  } catch (e) {
    await db.jobRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), ok: false, error: (e as Error).message.slice(0, 500) } });
    await reportError(e, { job: name });
    throw e;
  }
}

/** Estado de cada tarea: última ejecución y si está atrasada (más de 2 veces su intervalo esperado sin éxito). */
export async function jobStatus(now = new Date()) {
  return Promise.all((Object.keys(JOBS) as JobName[]).map(async (name) => {
    const [last, lastOk] = await Promise.all([
      db.jobRun.findFirst({ where: { name }, orderBy: { startedAt: "desc" } }),
      db.jobRun.findFirst({ where: { name, ok: true }, orderBy: { startedAt: "desc" } }),
    ]);
    const limit = JOBS[name].everyHours * 2 * 3600_000;
    const stale = !lastOk || now.getTime() - lastOk.startedAt.getTime() > limit;
    return { name, label: JOBS[name].label, everyHours: JOBS[name].everyHours, lastRun: last?.startedAt ?? null, lastOk: lastOk?.startedAt ?? null, lastFailed: last?.ok === false, lastError: last?.ok === false ? last.error : null, stale };
  }));
}
