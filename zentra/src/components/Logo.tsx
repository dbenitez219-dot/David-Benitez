import Image from "next/image";

/**
 * Logo oficial de ZENTRA (public/logo.png, public/logo-mark.png).
 * Nota: la versión entregada incluía el símbolo ®; se retiró porque la marca aún no está
 * verificada como registrada. Se puede restaurar cuando el registro esté confirmado.
 */
export function Logo({ width = 190, markOnly = false }: { width?: number; markOnly?: boolean }) {
  return markOnly ? (
    <Image src="/logo-mark.png" alt="ZENTRA" width={width} height={Math.round(width * 0.773)} priority />
  ) : (
    <Image src="/logo.png" alt="ZENTRA — Ad Intelligence Platform" width={width} height={Math.round(width * 0.18)} priority />
  );
}
