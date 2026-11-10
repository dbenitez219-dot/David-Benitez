import { NextRequest, NextResponse } from "next/server";
import { metaConfig } from "@/server/integrations/meta/config";
import { handleDataDeletion } from "@/server/integrations/meta/deauthorize";
import { parseSignedRequest } from "@/server/integrations/meta/signed-request";

export async function POST(req: NextRequest) {
  const c = metaConfig();
  const signed = String((await req.formData().catch(() => null))?.get("signed_request") ?? "");
  const data = parseSignedRequest(signed, c.appSecret);
  if (!data?.user_id) return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  const code = await handleDataDeletion(data.user_id);
  return NextResponse.json({ url: `${c.appUrl}/data-deletion?code=${code}`, confirmation_code: code });
}
