import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { ServiceError } from "@/server/errors";
import { exportUserData } from "@/server/privacy/service";

export const dynamic = "force-dynamic";

/** Descarga de los datos personales del usuario autenticado (JSON). */
export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const data = await exportUserData(s.userId);
    return new NextResponse(JSON.stringify(data, null, 2), { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="zentra-datos-${new Date().toISOString().slice(0, 10)}.json"`, "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof ServiceError) return NextResponse.json({ error: e.message }, { status: 429 });
    throw e;
  }
}
