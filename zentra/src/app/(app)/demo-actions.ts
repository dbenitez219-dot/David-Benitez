"use server";
import { revalidatePath } from "next/cache";
import { audit } from "@/server/audit/audit";
import { removeDemo, seedDemo } from "@/server/demo/demo-data";
import { requireOrg } from "@/server/tenancy/context";

export async function seedDemoAction() {
  const ctx = await requireOrg("ADMIN");
  const r = await seedDemo(ctx.organizationId);
  await audit({ action: "demo.seed", userId: ctx.user.id, organizationId: ctx.organizationId, metadata: { created: r.created } });
  revalidatePath("/", "layout");
}

export async function removeDemoAction() {
  const ctx = await requireOrg("ADMIN");
  const n = await removeDemo(ctx.organizationId);
  await audit({ action: "demo.remove", userId: ctx.user.id, organizationId: ctx.organizationId, metadata: { accounts: n } });
  revalidatePath("/", "layout");
}
