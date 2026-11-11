"use client";

// Último recurso: falla el diseño raíz. Sin dependencias del resto de la app.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es">
      <body style={{ background: "#0a0a0a", color: "#fff", fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100dvh", textAlign: "center", padding: 20 }}>
        <div>
          <h1 style={{ fontSize: 20 }}>Algo salió mal / Something went wrong</h1>
          <p style={{ color: "#8b8b94", fontSize: 14 }}>Ya registramos el problema. / We&apos;ve logged the problem.</p>
          <button onClick={reset} style={{ marginTop: 16, background: "#e5202e", color: "#fff", border: 0, borderRadius: 8, padding: "10px 16px", cursor: "pointer" }}>Reintentar / Retry</button>
        </div>
      </body>
    </html>
  );
}
