import { NextRequest, NextResponse } from "next/server";
import { handleWebhook } from "@/server/billing/service";

export const dynamic = "force-dynamic";

/** Webhook de proveedores de pago: firma verificada, eventos idempotentes. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const r = await handleWebhook(provider, await req.text(), req.headers);
  return NextResponse.json(r.body, { status: r.status });
}
