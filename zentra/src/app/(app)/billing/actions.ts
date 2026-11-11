"use server";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { PLAN_IDS, type PlanId } from "@/server/billing/plans";
import { simulatedAllowed } from "@/server/billing/providers/simulated";
import { cancelSubscription, resumeSubscription, settlePayment, startCheckout, startTrial } from "@/server/billing/service";
import { ServiceError } from "@/server/errors";
import { requireOrg } from "@/server/tenancy/context";

const back = (q: string) => redirect(`/billing?${q}`);
const plan = (v: FormDataEntryValue | null) => (PLAN_IDS.includes(String(v) as PlanId) ? (String(v) as PlanId) : null);

export async function startTrialAction(fd: FormData) {
  const ctx = await requireOrg("ADMIN"); const p = plan(fd.get("plan"));
  if (!p) return back("msg=" + encodeURIComponent("Plan inválido."));
  try { await startTrial({ organizationId: ctx.organizationId, userId: ctx.user.id, planId: p }); } catch (e) { if (e instanceof ServiceError) return back("msg=" + encodeURIComponent(e.message)); throw e; }
  revalidatePath("/", "layout"); return back("msg=" + encodeURIComponent("Prueba gratuita iniciada."));
}

/** Crea el pago pendiente y lleva al cliente a la página del proveedor. Aquí NO se cobra nada. */
export async function checkoutAction(fd: FormData) {
  const ctx = await requireOrg("ADMIN"); const p = plan(fd.get("plan"));
  if (!p) return back("msg=" + encodeURIComponent("Plan inválido."));
  let url: string;
  try {
    ({ url } = await startCheckout({ organizationId: ctx.organizationId, userId: ctx.user.id, planId: p, consentRecurring: fd.get("consent") === "on", returnUrl: process.env.APP_URL ?? "http://localhost:3000" }));
  } catch (e) { if (e instanceof ServiceError) return redirect(`/billing/checkout?plan=${p}&error=${encodeURIComponent(e.message)}`); throw e; }
  // Páginas propias (pago simulado) se abren como ruta interna; las de un proveedor real, en su dirección externa.
  const u = new URL(url), own = new URL(process.env.APP_URL ?? "http://localhost:3000");
  return redirect(u.origin === own.origin ? u.pathname + u.search : url);
}

export async function cancelAction() {
  const ctx = await requireOrg("ADMIN");
  try { await cancelSubscription({ organizationId: ctx.organizationId, userId: ctx.user.id }); } catch (e) { if (e instanceof ServiceError) return back("msg=" + encodeURIComponent(e.message)); throw e; }
  revalidatePath("/", "layout"); return back("msg=" + encodeURIComponent("Suscripción cancelada: conservas el acceso hasta el fin del período pagado."));
}
export async function resumeAction() {
  const ctx = await requireOrg("ADMIN");
  try { await resumeSubscription({ organizationId: ctx.organizationId, userId: ctx.user.id }); } catch (e) { if (e instanceof ServiceError) return back("msg=" + encodeURIComponent(e.message)); throw e; }
  revalidatePath("/", "layout"); return back("msg=" + encodeURIComponent("Cancelación deshecha. El cobro automático no se reactiva sin tu autorización al pagar."));
}

/** Resultado del pago SIMULADO (no cobra nada). Solo disponible si el proveedor simulado está permitido. */
export async function simulatedResultAction(fd: FormData) {
  const ctx = await requireOrg("ADMIN");
  if (!simulatedAllowed()) return back("msg=" + encodeURIComponent("Los pagos simulados no están habilitados."));
  const pay = await db.payment.findFirst({ where: { organizationId: ctx.organizationId, provider: "simulated", providerRef: String(fd.get("ref")), status: "PENDING" } });
  if (!pay) return back("msg=" + encodeURIComponent("Pago no encontrado o ya resuelto."));
  const ok = fd.get("result") === "ok";
  await settlePayment(pay.id, ok ? { status: "succeeded", paymentMethodToken: pay.consentRecurring ? `simtok_${randomBytes(8).toString("hex")}` : undefined } : { status: "failed", reason: "Pago simulado rechazado" });
  revalidatePath("/", "layout"); return back("msg=" + encodeURIComponent(ok ? "Pago SIMULADO registrado (no se cobró nada). Tu plan está activo." : "Pago simulado rechazado."));
}
