import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

describe("cifrado de secretos", () => {
  it("cifra y descifra", () => {
    const enc = encryptSecret("EAAB-token-de-meta");
    expect(enc).not.toContain("EAAB");
    expect(decryptSecret(enc)).toBe("EAAB-token-de-meta");
  });
  it("usa IV distinto cada vez", () => {
    expect(encryptSecret("x")).not.toBe(encryptSecret("x"));
  });
  it("detecta manipulación", () => {
    const parts = encryptSecret("secreto").split(".");
    parts[3] = Buffer.from("manipulado").toString("base64");
    expect(() => decryptSecret(parts.join("."))).toThrow();
  });
});
