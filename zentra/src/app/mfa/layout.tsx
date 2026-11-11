import { Logo } from "@/components/Logo";

export const metadata = { title: "ZENTRA", robots: { index: false, follow: false } };

export default function MfaLayout({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10"><div className="mb-8 self-center"><Logo width={200} /></div><div className="card p-6">{children}</div></main>;
}
