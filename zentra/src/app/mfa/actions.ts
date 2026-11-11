"use server";
import { redirect } from "next/navigation";
import { markMfaVerified } from "@/server/auth/mfa-session";
import { getSession } from "@/server/auth/session";
import { confirmTotpSetup, verifySecondFactor } from "@/server/auth/totp";
import { ServiceError } from "@/server/errors";

export type MfaState = { error?: string; codes?: string[] } | undefined;

async function owner() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.user.platformRole !== "SUPERADMIN") redirect("/dashboard");
  return s;
}

export async function confirmSetupAction(_: MfaState, fd: FormData): Promise<MfaState> {
  const s = await owner();
  try {
    const codes = await confirmTotpSetup(s.userId, String(fd.get("code") ?? ""));
    await markMfaVerified(s.id);
    return { codes }; // se muestran una sola vez
  } catch (e) { if (e instanceof ServiceError) return { error: e.message }; throw e; }
}

export async function verifyMfaAction(_: MfaState, fd: FormData): Promise<MfaState> {
  const s = await owner();
  try {
    if (!(await verifySecondFactor(s.userId, String(fd.get("code") ?? "")))) return { error: "El código no es correcto." };
  } catch (e) { if (e instanceof ServiceError) return { error: e.message }; throw e; }
  await markMfaVerified(s.id);
  redirect("/admin");
}
