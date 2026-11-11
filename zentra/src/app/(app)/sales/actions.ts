"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import type { FormMsg } from "@/components/ActionForm";
import { convertLead, createLead, createSale, deleteLead, deleteSale, setLeadStatus } from "@/server/commercial/service";
import { ServiceError } from "@/server/errors";
import { requireOrg } from "@/server/tenancy/context";

const done = () => revalidatePath("/", "layout");
const fail = (e: unknown): FormMsg => {
  if (e instanceof ServiceError) return { error: e.message };
  if (e instanceof ZodError) return { error: "Revisa los datos: " + (e.issues[0]?.message ?? "formulario inválido") };
  throw e;
};
const obj = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([, v]) => v !== ""));

export async function addLeadAction(_: FormMsg, fd: FormData): Promise<FormMsg> {
  const ctx = await requireOrg("ANALYST");
  try { await createLead({ organizationId: ctx.organizationId, userId: ctx.user.id }, obj(fd)); } catch (e) { return fail(e); }
  done(); return { ok: "Lead registrado." };
}
export async function addSaleAction(_: FormMsg, fd: FormData): Promise<FormMsg> {
  const ctx = await requireOrg("ANALYST");
  try { await createSale({ organizationId: ctx.organizationId, userId: ctx.user.id }, obj(fd)); } catch (e) { return fail(e); }
  done(); return { ok: "Venta registrada." };
}

async function row(fd: FormData, fn: (who: { organizationId: string; userId: string }, id: string) => Promise<unknown>) {
  const ctx = await requireOrg("ANALYST");
  let m = "Listo.";
  try { await fn({ organizationId: ctx.organizationId, userId: ctx.user.id }, String(fd.get("id"))); } catch (e) { m = e instanceof ServiceError ? e.message : "No se pudo completar la operación."; if (!(e instanceof ServiceError)) console.error(e); }
  done(); redirect(`/sales?msg=${encodeURIComponent(m)}`);
}
export async function convertLeadAction(fd: FormData) { return row(fd, convertLead); }
export async function deleteLeadAction(fd: FormData) { return row(fd, deleteLead); }
export async function deleteSaleAction(fd: FormData) { return row(fd, deleteSale); }
export async function leadStatusAction(fd: FormData) {
  const status = ["CONTACTED", "LOST", "NEW"].includes(String(fd.get("status"))) ? (String(fd.get("status")) as "CONTACTED" | "LOST" | "NEW") : "NEW";
  return row(fd, (who, id) => setLeadStatus(who, id, status));
}
