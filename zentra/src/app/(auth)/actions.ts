"use server";
import { redirect } from "next/navigation";
import { loginSchema, registerSchema } from "@/lib/validation";
import { authenticate, registerUser } from "@/server/auth/service";
import { createSession, destroySession } from "@/server/auth/session";
import { clientMeta } from "@/server/request";

export type FormState = { error?: string } | undefined;

export async function loginAction(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: "Revisa tu correo y contraseña." };
  const meta = await clientMeta();
  const r = await authenticate(parsed.data.email, parsed.data.password, meta.ip);
  if (!r.ok) return { error: r.error };
  await createSession(r.data.userId, r.data.organizationId, meta);
  redirect("/dashboard");
}

export async function registerAction(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = registerSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const meta = await clientMeta();
  const r = await registerUser(parsed.data, meta.ip);
  if (!r.ok) return { error: r.error };
  await createSession(r.data.userId, r.data.organizationId, meta);
  redirect("/dashboard");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
