import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { allow } from "@/server/auth/rate-limit";

beforeEach(() => db.rateLimit.deleteMany());
afterAll(() => db.$disconnect());

describe("limitador de intentos", () => {
  it("permite exactamente `max` intentos por ventana y bloquea el siguiente", async () => {
    const r: boolean[] = [];
    for (let i = 0; i < 5; i++) r.push(await allow("k", 3, 60_000));
    expect(r).toEqual([true, true, true, false, false]);
  });
  it("las claves son independientes", async () => {
    for (let i = 0; i < 4; i++) await allow("a", 3, 60_000);
    expect(await allow("a", 3, 60_000)).toBe(false); expect(await allow("b", 3, 60_000)).toBe(true);
  });
  it("la ventana se reinicia al vencer", async () => {
    for (let i = 0; i < 3; i++) await allow("k", 2, 60_000);
    await db.rateLimit.update({ where: { key: "k" }, data: { windowStart: new Date(Date.now() - 61_000) } });
    expect(await allow("k", 2, 60_000)).toBe(true);
    expect((await db.rateLimit.findUniqueOrThrow({ where: { key: "k" } })).count).toBe(1);
  });
  it("es atómico: 30 solicitudes simultáneas con límite 10 dejan pasar exactamente 10", async () => {
    const r = await Promise.all(Array.from({ length: 30 }, () => allow("race", 10, 60_000)));
    expect(r.filter(Boolean)).toHaveLength(10);
  });
});
