import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { runJob } from "@/server/jobs";
import { runBillingCycle } from "@/server/billing/service";

export const dynamic = "force-dynamic";

/** Ciclo de facturación diario (avisos de prueba, vencimientos, renovaciones, reintentos). Protegido con CRON_SECRET. */
async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET ?? "";
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await runJob("billing", () => runBillingCycle()));
}
export const GET = run;
export const POST = run;
