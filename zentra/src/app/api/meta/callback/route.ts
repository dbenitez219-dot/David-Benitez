import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireOrg } from "@/server/tenancy/context";
import { metaConfig } from "@/server/integrations/meta/config";
import { connectMeta } from "@/server/integrations/meta/oauth";

export const dynamic = "force-dynamic";

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function GET(req: NextRequest) {
  const ctx = await requireOrg("ADMIN");
  const { appUrl } = metaConfig();
  const back = (q: string) => {
    const r = NextResponse.redirect(`${appUrl}/connections?${q}`);
    r.cookies.delete({ name: "zentra_meta_state", path: "/api/meta" });
    return r;
  };
  const p = req.nextUrl.searchParams;
  if (p.get("error")) return back("error=denied"); // el usuario canceló en Meta
  const state = p.get("state"), code = p.get("code"), cookie = req.cookies.get("zentra_meta_state")?.value;
  if (!state || !code || !cookie || !same(state, cookie)) return back("error=state"); // protección CSRF
  try {
    const { count } = await connectMeta({ organizationId: ctx.organizationId, userId: ctx.user.id, code });
    return back(`connected=${count}`);
  } catch (e) {
    console.error("meta callback", (e as Error).message);
    return back("error=failed");
  }
}
