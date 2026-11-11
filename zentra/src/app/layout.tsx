import "./globals.css";
import type { Metadata, Viewport } from "next";
import { getLocale } from "@/lib/locale";

export const metadata: Metadata = {
  title: "ZENTRA — AI Ad Intelligence",
  description: "Plataforma de inteligencia artificial para analizar, optimizar y automatizar campañas publicitarias.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0a0a0a" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale(); // idioma elegido por la persona (nunca deducido por IP)
  return (
    <html lang={locale}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
