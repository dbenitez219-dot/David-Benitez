"use server";
import { redirect } from "next/navigation";
import type { FormMsg } from "@/components/ActionForm";
import { changePassword, sendVerificationEmail, signOutEverywhere } from "@/server/auth/account";
import { destroySession, getSession } from "@/server/auth/session";
import { ServiceError } from "@/server/errors";
import { deleteAccount } from "@/server/privacy/service";
import { requireOrg } from "@/server/tenancy/context";

export async function changePasswordAction(_: FormMsg, fd: FormData): Promise<FormMsg> {
  const ctx = await requireOrg(); const s = await getSession();
  try { await changePassword({ userId: ctx.user.id, keepSessionId: s?.id }, String(fd.get("current") ?? ""), String(fd.get("next") ?? "")); }
  catch (e) { if (e instanceof ServiceError) return { error: e.message }; throw e; }
  return { ok: "Contraseña cambiada. Cerramos tus otras sesiones." };
}

export async function signOutEverywhereAction() {
  const ctx = await requireOrg(); const s = await getSession();
  await signOutEverywhere(ctx.user.id, s?.id);
  redirect("/settings/account?msg=" + encodeURIComponent("Cerramos las sesiones en tus otros dispositivos."));
}

export async function resendVerificationAction() {
  const ctx = await requireOrg();
  await sendVerificationEmail(ctx.user.id);
  redirect("/settings/account?msg=" + encodeURIComponent("Si hay un proveedor de correo configurado, te enviamos el enlace de confirmación."));
}

export async function deleteAccountAction(_: FormMsg, fd: FormData): Promise<FormMsg> {
  const ctx = await requireOrg();
  try { await deleteAccount(ctx.user.id, { password: String(fd.get("password") ?? ""), confirm: String(fd.get("confirm") ?? "") }); }
  catch (e) { if (e instanceof ServiceError) return { error: e.message }; throw e; }
  await destroySession();
  redirect("/?deleted=1");
}
