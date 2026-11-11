"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import type { FormMsg } from "@/components/ActionForm";
import { LOCALE_COOKIE, isLocale } from "@/lib/i18n";
import { getT } from "@/lib/locale";
import { RegionalError, updateOrgRegional, updateUserRegional } from "@/server/regional/service";
import { requireOrg } from "@/server/tenancy/context";

async function fail(e: unknown): Promise<FormMsg> {
  const t = await getT();
  if (e instanceof RegionalError) return { error: t(e.key) };
  throw e;
}

export async function saveUserRegionalAction(_: FormMsg, fd: FormData): Promise<FormMsg> {
  const ctx = await requireOrg();
  const t = await getT();
  try {
    await updateUserRegional(ctx.user.id, { locale: String(fd.get("locale")), countryCode: String(fd.get("countryCode") ?? ""), timezone: String(fd.get("timezone") ?? ""), phoneCountry: String(fd.get("phoneCountry") ?? ""), phone: String(fd.get("phone") ?? "") });
  } catch (e) { return fail(e); }
  const l = String(fd.get("locale"));
  if (isLocale(l)) (await cookies()).set(LOCALE_COOKIE, l, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
  revalidatePath("/", "layout");
  return { ok: t("reg.saved") };
}

export async function saveOrgRegionalAction(_: FormMsg, fd: FormData): Promise<FormMsg> {
  const ctx = await requireOrg("ADMIN");
  const t = await getT();
  try {
    await updateOrgRegional({ organizationId: ctx.organizationId, userId: ctx.user.id }, { countryCode: String(fd.get("countryCode") ?? ""), currency: String(fd.get("currency") ?? ""), timezone: String(fd.get("timezone") ?? "") });
  } catch (e) { return fail(e); }
  revalidatePath("/", "layout");
  return { ok: t("reg.saved") };
}
