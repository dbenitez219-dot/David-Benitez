import { NextRequest, NextResponse } from "next/server";
import { metaConfig } from "@/server/integrations/meta/config";
import { handleDeauthorize } from "@/server/integrations/meta/deauthorize";
import { parseSignedRequest } from "@/server/integrations/meta/signed-request";

export async function POST(req: NextRequest) {
  const signed = String((await req.formData().catch(() => null))?.get("signed_request") ?? "");
  const data = parseSignedRequest(signed, metaConfig().appSecret);
  if (!data?.user_id) return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  await handleDeauthorize(data.user_id);
  return NextResponse.json({ ok: true });
}
