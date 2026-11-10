import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireOrg } from "@/server/tenancy/context";
import { metaConfig } from "@/server/integrations/meta/config";
import { buildAuthUrl } from "@/server/integrations/meta/oauth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await requireOrg("ADMIN");
  const c = metaConfig();
  if (!c.configured) return NextResponse.redirect(`${c.appUrl}/connections?error=not_configured`);
  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(buildAuthUrl(state, { manage: new URL(req.url).searchParams.get("manage") === "1" }));
  res.cookies.set("zentra_meta_state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/meta", maxAge: 600 });
  return res;
}
