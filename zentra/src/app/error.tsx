"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

// Pantalla de error amigable (sin detalles técnicos). El error real ya fue registrado y alertado en el servidor.
const T: Record<string, [string, string, string, string, string]> = {
  es: ["Algo salió mal", "Ya registramos el problema. Tus datos están a salvo. Puedes reintentar o volver al inicio.", "Reintentar", "Ir al inicio", "Referencia"],
  en: ["Something went wrong", "We've logged the problem. Your data is safe. You can retry or go back home.", "Try again", "Go home", "Reference"],
  pt: ["Algo deu errado", "Já registramos o problema. Seus dados estão seguros. Você pode tentar novamente ou voltar ao início.", "Tentar novamente", "Ir para o início", "Referência"],
};

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [lang, setLang] = useState("es");
  useEffect(() => { setLang(document.documentElement.lang in T ? document.documentElement.lang : "es"); }, []);
  const [title, body, retry, home, ref] = T[lang];
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-5 text-center">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-muted">{body}</p>
      {error.digest && <p className="mt-2 text-xs text-muted">{ref}: {error.digest}</p>}
      <div className="mt-6 flex gap-2"><button className="btn" onClick={reset}>{retry}</button><Link href="/" className="btn btn-ghost">{home}</Link></div>
    </main>
  );
}
