import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reportError } from "@/lib/monitor";

export const dynamic = "force-dynamic";

/** Disponibilidad: la base de datos responde y no hay migraciones a medias. Sin detalles internos en la respuesta. */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    const broken = await db.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL`;
    if (Number(broken[0]?.n ?? 0) > 0) return NextResponse.json({ status: "migrations_incomplete" }, { status: 503, headers: { "cache-control": "no-store" } });
    return NextResponse.json({ status: "ready" }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    await reportError(e, { route: "/api/ready" });
    return NextResponse.json({ status: "unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
