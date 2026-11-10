import { describe, expect, it } from "vitest";
import { passwordSchema, registerSchema, slugify } from "@/lib/validation";

describe("validación", () => {
  it("rechaza contraseñas débiles", () => {
    expect(passwordSchema.safeParse("corta1A").success).toBe(false);
    expect(passwordSchema.safeParse("sinnumeroAAAA").success).toBe(false);
    expect(passwordSchema.safeParse("Correcta12345").success).toBe(true);
  });
  it("normaliza el correo", () => {
    const r = registerSchema.parse({ name: "Ana", email: " ANA@Mail.com ", password: "Correcta12345", organizationName: "Mi Marca" });
    expect(r.email).toBe("ana@mail.com");
  });
  it("genera slugs seguros", () => {
    expect(slugify("Cristal Áuto & Co.")).toBe("cristal-auto-co");
  });
});
