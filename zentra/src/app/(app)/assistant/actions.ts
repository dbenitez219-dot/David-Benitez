"use server";
import { revalidatePath } from "next/cache";
import { askAssistant } from "@/server/ai/assistant";
import { getLocale } from "@/lib/locale";
import { requireOrg } from "@/server/tenancy/context";

export type AskState = { error?: string } | undefined;

export async function askAction(_: AskState, fd: FormData): Promise<AskState> {
  const ctx = await requireOrg("ANALYST");
  const r = await askAssistant({ organizationId: ctx.organizationId, userId: ctx.user.id, currency: ctx.organization.currency, locale: await getLocale(), question: fd.getAll("question").map(String).filter((q) => q.trim()).at(-1) ?? "" }); // el botón sugerido va después del campo de texto
  revalidatePath("/assistant");
  return r.limited ? { error: r.answer } : undefined;
}
