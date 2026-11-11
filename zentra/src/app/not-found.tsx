import Link from "next/link";
import { getT } from "@/lib/locale";

export default async function NotFound() {
  const t = await getT();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-5 text-center">
      <p className="text-6xl font-bold text-zred">404</p>
      <h1 className="mt-3 text-xl font-semibold">{t("notfound.title")}</h1>
      <p className="mt-2 text-sm text-muted">{t("notfound.body")}</p>
      <Link href="/" className="btn mt-6">{t("oops.home")}</Link>
    </main>
  );
}
