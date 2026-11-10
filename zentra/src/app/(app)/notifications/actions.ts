"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOrg } from "@/server/tenancy/context";

export async function markReadAction(fd: FormData) {
  const ctx = await requireOrg();
  const id = String(fd.get("id") ?? "");
  await db.notification.updateMany({ where: { organizationId: ctx.organizationId, readAt: null, ...(id ? { id } : {}) }, data: { readAt: new Date() } });
  revalidatePath("/", "layout");
}
