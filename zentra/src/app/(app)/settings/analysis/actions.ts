"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/server/audit/audit";
import { getAnalysisConfig } from "@/server/analytics/settings";
import { requireOrg } from "@/server/tenancy/context";

const opt = z.preprocess((v) => (v === "" || v === null ? null : v), z.coerce.number().positive().max(1e12).nullable());
const schema = z.object({
  minSpend: z.coerce.number().positive().max(1e12), minDays: z.coerce.number().int().min(1).max(60), minImpressions: z.coerce.number().int().min(0).max(1e8),
  targetCprMessages: opt, targetCprLeads: opt, targetCprSales: opt,
  maxFrequency: z.coerce.number().min(1).max(20), anomalyFactor: z.coerce.number().min(1.2).max(20),
});
export type SettingsState = { error?: string; saved?: boolean } | undefined;

export async function saveAnalysisAction(_: SettingsState, fd: FormData): Promise<SettingsState> {
  const ctx = await requireOrg("ADMIN");
  const p = schema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: "Revisa los valores: " + (p.error.issues[0]?.path.join(".") ?? "") };
  await getAnalysisConfig(ctx.organizationId); // asegura que exista
  await db.analysisSettings.update({ where: { organizationId: ctx.organizationId }, data: p.data });
  await audit({ action: "settings.analysis_update", userId: ctx.user.id, organizationId: ctx.organizationId, metadata: p.data });
  revalidatePath("/", "layout");
  return { saved: true };
}
