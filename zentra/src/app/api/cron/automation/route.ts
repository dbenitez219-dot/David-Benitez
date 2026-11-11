import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { runJob } from "@/server/jobs";
import { evaluateAll } from "@/server/automation/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Evaluación programada de reglas y avisos (después de la sincronización). Protegida con CRON_SECRET. */
async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET ?? "";
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const summary = await runJob("automation", async () => { const r = await evaluateAll(); return { organizations: r.length, proposed: r.reduce((a, b) => a + b.proposed, 0), executed: r.reduce((a, b) => a + b.executed, 0), simulated: r.reduce((a, b) => a + b.simulated, 0) }; });
  return NextResponse.json(summary);
}
export const GET = run;
export const POST = run;
