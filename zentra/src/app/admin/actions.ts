"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { setOrgStatus, setPlanPrice, setUserStatus } from "@/server/admin/service";
import { ServiceError } from "@/server/errors";
import { requireSuperAdmin } from "@/server/tenancy/context";
import type { FormMsg } from "@/components/ActionForm";

export async function setPriceAction(_: FormMsg, fd: FormData): Promise<FormMsg> {
  const admin = await requireSuperAdmin();
  const tax = String(fd.get("taxPercent") ?? "");
  try {
    await setPlanPrice(admin.id, { planId: fd.get("planId"), countryCode: fd.get("countryCode"), currency: fd.get("currency"), amountMinor: fd.get("amountMinor"), taxIncluded: fd.get("taxIncluded") === "on", taxPercent: tax === "" ? null : tax, active: fd.get("active") === "on" });
  } catch (e) {
    if (e instanceof ServiceError) return { error: e.message };
    if (e instanceof ZodError) return { error: "Revisa los datos (país de 2 letras, moneda de 3, importe entero en unidad mínima)." };
    throw e;
  }
  revalidatePath("/admin/plans"); return { ok: "Precio guardado." };
}

async function run(back: string, fn: () => Promise<void>) {
  let m = "Listo.";
  try { await fn(); } catch (e) { m = e instanceof ServiceError ? e.message : "No se pudo completar."; if (!(e instanceof ServiceError)) console.error(e); }
  revalidatePath(back); redirect(`${back}?msg=${encodeURIComponent(m)}`);
}
export async function orgStatusAction(fd: FormData) {
  const admin = await requireSuperAdmin();
  return run("/admin/orgs", () => setOrgStatus(admin.id, String(fd.get("id")), fd.get("status") === "SUSPENDED" ? "SUSPENDED" : "ACTIVE"));
}
export async function userStatusAction(fd: FormData) {
  const admin = await requireSuperAdmin();
  return run("/admin/users", () => setUserStatus(admin.id, String(fd.get("id")), fd.get("status") === "SUSPENDED" ? "SUSPENDED" : "ACTIVE"));
}
