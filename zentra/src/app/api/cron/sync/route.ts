import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { syncAll } from "@/server/integrations/meta/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Sincronización programada. Protegida con `Authorization: Bearer $CRON_SECRET`. */
async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET ?? "";
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const results = await syncAll();
  return NextResponse.json({ accounts: results.length, ok: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok && !r.skipped).length });
}
export const GET = run;
export const POST = run;
