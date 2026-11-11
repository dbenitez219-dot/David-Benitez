"use server";
import { redirect } from "next/navigation";
import { getT, getLocale } from "@/lib/locale";
import { prepareRegistration } from "@/server/regional/registration";
import { loginSchema, registerSchema } from "@/lib/validation";
import { authenticate, registerUser } from "@/server/auth/service";
import { createSession, destroySession } from "@/server/auth/session";
import { clientMeta } from "@/server/request";

export type FormState = { error?: string } | undefined;

export async function loginAction(_: FormState, fd: FormData): Promise<FormState> {
  const t = await getT();
  const parsed = loginSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: t("login.invalid") };
  const meta = await clientMeta();
  const r = await authenticate(parsed.data.email, parsed.data.password, meta.ip);
  if (!r.ok) return { error: r.error };
  await createSession(r.data.userId, r.data.organizationId, meta);
  redirect("/dashboard");
}

export async function registerAction(_: FormState, fd: FormData): Promise<FormState> {
  const t = await getT();
  const parsed = registerSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const prep = prepareRegistration({ countryCode: parsed.data.countryCode, phoneCountry: String(fd.get("phoneCountry") ?? ""), phone: String(fd.get("phone") ?? "") });
  if (!prep.ok) return { error: t(prep.key) };
  const meta = await clientMeta();
  const r = await registerUser({ ...parsed.data, countryCode: prep.country, phone: prep.phone, locale: await getLocale(), timezone: prep.timezone, currency: prep.currency }, meta.ip);
  if (!r.ok) return { error: r.error };
  await createSession(r.data.userId, r.data.organizationId, meta);
  redirect("/dashboard");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
