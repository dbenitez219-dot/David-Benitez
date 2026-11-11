"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n";
import { getSession } from "@/server/auth/session";

/** Cambia el idioma: se recuerda en una cookie y, si hay sesión, en el perfil del usuario. */
export async function setLocaleAction(fd: FormData) {
  const locale = String(fd.get("locale"));
  // Vuelve a la página desde la que se cambió el idioma (solo rutas internas).
  const h = await headers(), ref = h.get("referer");
  let next = String(fd.get("next") ?? "");
  if (!next && ref) { try { const u = new URL(ref); if (u.host === h.get("host")) next = u.pathname + u.search; } catch { /* sin referer válido */ } }
  if (isLocale(locale)) {
    (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
    const s = await getSession();
    if (s) await db.user.update({ where: { id: s.userId }, data: { locale } });
    revalidatePath("/", "layout");
  }
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/"); // solo rutas internas
}
