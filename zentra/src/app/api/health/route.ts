import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Vivacidad: el proceso responde. No toca la base de datos (para que un corte de la BD no reinicie la app). */
export function GET() {
  return NextResponse.json({ status: "ok", time: new Date().toISOString() }, { headers: { "cache-control": "no-store" } });
}
