/**
 * Logotipo provisional de ZENTRA (wordmark + marca "Z" roja).
 * TODO: reemplazar por el archivo de logo aprobado cuando se entregue (SVG/PNG).
 * No se usa el símbolo ® hasta verificar el registro de la marca.
 */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2 font-bold tracking-[0.18em]" style={{ fontSize: size * 0.7 }}>
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="7" fill="#e5202e" />
        <path d="M9 9h14l-9 14h9" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="square" />
      </svg>
      ZENTRA
    </span>
  );
}
