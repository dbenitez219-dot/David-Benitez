import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { runJob } from "@/server/jobs";
import { syncAll } from "@/server/integrations/meta/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Sincronización programada. Protegida con `Authorization: Bearer $CRON_SECRET`. */
async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET ?? "";
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const summary = await runJob("sync", async () => { const r = await syncAll(); return { accounts: r.length, ok: r.filter((x) => x.ok).length, failed: r.filter((x) => !x.ok && !x.skipped).length }; });
  return NextResponse.json(summary);
}
export const GET = run;
export const POST = run;
