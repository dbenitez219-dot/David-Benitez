import { existsSync } from "node:fs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getExampleNumber } from "libphonenumber-js/max";
import examples from "libphonenumber-js/examples.mobile.json";
import { db } from "@/lib/db";
import { currencyOf, currencies, flagUrl, isCountry, isCurrency, isTimezone, listCountries, normalize, searchCountries, timezoneOf } from "@/lib/countries";
import { formatLocale, makeFormatter } from "@/lib/format";
import { splitPhone, validatePhone } from "@/lib/phone";
import { registerUser } from "@/server/auth/service";
import { priceFor } from "@/server/billing/plans";
import { startCheckout } from "@/server/billing/service";
import { prepareRegistration } from "@/server/regional/registration";
import { RegionalError, updateOrgRegional, updateUserRegional } from "@/server/regional/service";

beforeEach(async () => { await db.rateLimit.deleteMany(); await db.auditLog.deleteMany(); await db.organization.deleteMany(); await db.user.deleteMany(); });
afterAll(() => db.$disconnect());

describe("países", () => {
  it("hay más de 200 países con nombre localizado, prefijo y bandera real", () => {
    const es = listCountries("es");
    expect(es.length).toBeGreaterThan(200);
    for (const c of es) { expect(c.name).not.toBe(c.code); expect(c.dial).toMatch(/^\+\d{1,4}$/); expect(existsSync(`public${c.flag}`), `bandera de ${c.code}`).toBe(true); }
    expect(es.find((c) => c.code === "PY")).toMatchObject({ name: "Paraguay", dial: "+595", flag: flagUrl("PY") });
    expect(listCountries("en").find((c) => c.code === "BR")?.name).toBe("Brazil");
    expect(listCountries("pt").find((c) => c.code === "BR")?.name).toBe("Brasil");
    expect(listCountries("es").find((c) => c.code === "US")?.name).toBe("Estados Unidos");
    expect(listCountries("en").find((c) => c.code === "US")?.name).toBe("United States");
  });
  it("buscador tolerante: nombre sin acentos, código ISO y prefijo telefónico", () => {
    const l = listCountries("es");
    const names = (q: string) => searchCountries(l, q).map((c) => c.code);
    expect(names("para")).toContain("PY"); expect(names("PERU")).toContain("PE"); expect(names("perú")).toContain("PE");
    expect(names("py")).toEqual(["PY"]); expect(names("+595")).toEqual(["PY"]); expect(names("595")).toEqual(["PY"]);
    expect(names("+1")).toEqual(expect.arrayContaining(["US", "CA"])); expect(names("zzzzz")).toEqual([]); expect(names("")).toHaveLength(l.length);
    expect(normalize("  Perú ")).toBe("peru");
  });
  it("moneda y zona horaria sugeridas por país, y validaciones", () => {
    expect([currencyOf("PY"), currencyOf("BR"), currencyOf("US"), currencyOf("ES"), currencyOf("XX")]).toEqual(["PYG", "BRL", "USD", "EUR", null]);
    expect(timezoneOf("PY")).toBe("America/Asuncion"); expect(timezoneOf("XX")).toBeNull();
    // países con varias zonas: la principal, no la primera por orden alfabético
    expect([timezoneOf("BR"), timezoneOf("US"), timezoneOf("AR"), timezoneOf("MX"), timezoneOf("ES"), timezoneOf("CL")]).toEqual(["America/Sao_Paulo", "America/New_York", "America/Argentina/Buenos_Aires", "America/Mexico_City", "Europe/Madrid", "America/Santiago"]);
    for (const c of listCountries("en").map((x) => x.code)) { const z = timezoneOf(c); if (z) expect(isTimezone(z), `${c} ${z}`).toBe(true); } // siempre una zona válida
    expect(isCountry("py")).toBe(true); expect(isCountry("ZZ")).toBe(false); expect(isCountry(5)).toBe(false);
    expect(isTimezone("America/Asuncion")).toBe(true); expect(isTimezone("Mars/Base")).toBe(false); expect(isTimezone("")).toBe(false);
    expect(isCurrency("pyg")).toBe(true); expect(isCurrency("ZZZ")).toBe(false); expect(currencies()).toContain("EUR");
  });
});

describe("teléfonos internacionales", () => {
  it("valida según las reglas de cada país: los números de ejemplo oficiales de 40 países son válidos", () => {
    const countries = listCountries("en").map((c) => c.code).filter((c) => getExampleNumber(c as any, examples)).slice(0, 40);
    expect(countries.length).toBe(40);
    for (const c of countries) { const ex = getExampleNumber(c as any, examples)!; expect(validatePhone(c, ex.number).ok, `${c} ${ex.number}`).toBe(true); }
  });
  it("acepta formato nacional o internacional y devuelve E.164", () => {
    expect(validatePhone("PY", "0981 123 456")).toMatchObject({ ok: true, e164: "+595981123456" });
    expect(validatePhone("PY", "+595 981 123456")).toMatchObject({ ok: true, e164: "+595981123456" });
    expect(validatePhone("BR", "(11) 91234-5678")).toMatchObject({ ok: true, e164: "+5511912345678" });
    expect(validatePhone("PY", "+55 11 91234-5678")).toMatchObject({ ok: true, e164: "+5511912345678" }); // número de otro país: se respeta
  });
  it("rechaza números inválidos para el país y países desconocidos", () => {
    expect(validatePhone("PY", "123")).toEqual({ ok: false, reason: "invalid" });
    expect(validatePhone("PY", "")).toEqual({ ok: false, reason: "invalid" });
    expect(validatePhone("PY", "9".repeat(40))).toEqual({ ok: false, reason: "invalid" });
    expect(validatePhone("PY", "abc")).toEqual({ ok: false, reason: "invalid" });
    expect(validatePhone("US", "0981 123 456")).toEqual({ ok: false, reason: "invalid" }); // formato paraguayo no vale en EE. UU.
    expect(validatePhone("ZZ", "0981123456")).toEqual({ ok: false, reason: "country" });
  });
  it("descompone un E.164 guardado para rellenar el formulario", () => {
    expect(splitPhone("+595981123456")).toMatchObject({ country: "PY" }); expect(splitPhone(null)).toBeNull(); expect(splitPhone("basura")).toBeNull();
  });
});

describe("formatos regionales", () => {
  const at = new Date("2026-03-05T00:00:00Z"), instant = new Date("2026-11-11T02:00:00Z");
  it("números y monedas con los separadores de cada región", () => {
    const es = makeFormatter({ formatLocale: "es-PY" }), en = makeFormatter({ formatLocale: "en-US" }), pt = makeFormatter({ formatLocale: "pt-BR" });
    expect(es.money(1234567, "PYG").replace(/\u00a0/g, " ")).toBe("Gs. 1.234.567"); expect(en.money(1234567.5, "USD")).toBe("$1,234,567.50"); expect(pt.money(1234.5, "BRL")).toMatch(/R\$\s?1\.234,50/);
    expect(es.pct(1234.5)).toBe("1.234,50%"); expect(en.pct(1234.5)).toBe("1,234.50%");
    expect(es.num(1234567)).toBe("1.234.567"); expect(en.num(1234567)).toBe("1,234,567");
  });
  it("fechas con el formato de cada región; las de calendario no se corren por la zona horaria", () => {
    const es = makeFormatter({ formatLocale: "es-PY", timeZone: "America/Asuncion" }), en = makeFormatter({ formatLocale: "en-US", timeZone: "America/Asuncion" });
    expect(es.dateLong(at)).toBe("05 mar. 2026"); expect(en.dateLong(at)).toBe("Mar 05, 2026");
    expect(es.dateLong(new Date("2026-11-11T00:00:00Z"))).toContain("11"); // sigue siendo el 11 aunque Asunción esté 3 h atrás
  });
  it("los instantes se muestran en la zona horaria del usuario", () => {
    const asu = makeFormatter({ formatLocale: "en-US", timeZone: "America/Asuncion" }), utc = makeFormatter({ formatLocale: "en-US", timeZone: "UTC" });
    expect(asu.dateTime(instant)).toBe("Nov 10, 2026, 11:00 PM"); expect(utc.dateTime(instant)).toBe("Nov 11, 2026, 2:00 AM");
    expect(asu.dateLocal(instant)).toBe("Nov 10, 2026");
    expect(makeFormatter({ formatLocale: "en-US", timeZone: "Mars/Base" }).dateTime(instant)).toContain("2026"); // zona inválida: no rompe
  });
  it("el locale de formato combina idioma y país elegidos", () => {
    expect(formatLocale("es", "MX")).toBe("es-MX"); expect(formatLocale("en", "PY")).toBe("en-PY"); expect(formatLocale("pt", "BR")).toBe("pt-BR");
    expect(formatLocale("es", null)).toBe("es-PY"); expect(formatLocale("en", null)).toBe("en-US"); expect(formatLocale("pt", "??")).toBe("pt-BR");
  });
});

describe("registro internacional", () => {
  it("el país es obligatorio y válido; el teléfono, opcional pero validado; moneda y zona se sugieren por país", () => {
    expect(prepareRegistration({})).toEqual({ ok: false, key: "err.country" });
    expect(prepareRegistration({ countryCode: "ZZ" })).toEqual({ ok: false, key: "err.country" });
    expect(prepareRegistration({ countryCode: "py", phone: "123" })).toEqual({ ok: false, key: "err.phone" });
    expect(prepareRegistration({ countryCode: "PY" })).toEqual({ ok: true, country: "PY", phone: undefined, timezone: "America/Asuncion", currency: "PYG" });
    expect(prepareRegistration({ countryCode: "BR", phoneCountry: "BR", phone: "(11) 91234-5678" })).toMatchObject({ ok: true, phone: "+5511912345678", currency: "BRL" });
    expect(prepareRegistration({ countryCode: "AR", phoneCountry: "PY", phone: "0981 123 456" })).toMatchObject({ ok: true, phone: "+595981123456", country: "AR" }); // el teléfono puede ser de otro país
  });
  it("se guardan idioma, teléfono, país, zona horaria y moneda elegidos; no se limita a Paraguay", async () => {
    const p = prepareRegistration({ countryCode: "BR", phoneCountry: "BR", phone: "(11) 91234-5678" });
    if (!p.ok) throw new Error("prep");
    const r = await registerUser({ name: "Ana", email: "ana@x.com", password: "Correcta12345", organizationName: "Org BR", countryCode: p.country, phone: p.phone, locale: "pt", timezone: p.timezone, currency: p.currency });
    if (!r.ok) throw new Error("registro");
    const u = await db.user.findUniqueOrThrow({ where: { id: r.data.userId } }), o = await db.organization.findUniqueOrThrow({ where: { id: r.data.organizationId! } });
    expect(u).toMatchObject({ countryCode: "BR", phone: "+5511912345678", locale: "pt", timezone: "America/Sao_Paulo", currency: "BRL" });
    expect(o).toMatchObject({ countryCode: "BR", currency: "BRL", timezone: "America/Sao_Paulo" });
  });
});

describe("ajustes regionales (servicio)", () => {
  async function mk(email: string) {
    const r = await registerUser({ name: "A", email, password: "Correcta12345", organizationName: "O", countryCode: "PY" });
    if (!r.ok) throw new Error("registro");
    return { userId: r.data.userId, organizationId: r.data.organizationId as string };
  }
  const ok = { locale: "en", countryCode: "PY", timezone: "America/Asuncion" };
  it("guarda las preferencias del usuario y las audita", async () => {
    const e = await mk("a@x.com");
    await updateUserRegional(e.userId, { ...ok, locale: "pt", countryCode: "br", timezone: "America/Sao_Paulo", phoneCountry: "BR", phone: "(11) 91234-5678" });
    expect(await db.user.findUniqueOrThrow({ where: { id: e.userId } })).toMatchObject({ locale: "pt", countryCode: "BR", timezone: "America/Sao_Paulo", phone: "+5511912345678" });
    await updateUserRegional(e.userId, { ...ok, phone: "" }); // vaciar el teléfono lo borra
    expect((await db.user.findUniqueOrThrow({ where: { id: e.userId } })).phone).toBeNull();
    expect(await db.auditLog.count({ where: { action: "regional.user_update" } })).toBe(2);
  });
  it("rechaza datos inválidos con claves de traducción", async () => {
    const e = await mk("a@x.com");
    const key = async (p: Promise<unknown>) => p.then(() => "ok", (x) => (x instanceof RegionalError ? x.key : "otro"));
    expect(await key(updateUserRegional(e.userId, { ...ok, locale: "fr" }))).toBe("err.locale");
    expect(await key(updateUserRegional(e.userId, { ...ok, countryCode: "ZZ" }))).toBe("err.country");
    expect(await key(updateUserRegional(e.userId, { ...ok, timezone: "Mars/Base" }))).toBe("err.timezone");
    expect(await key(updateUserRegional(e.userId, { ...ok, phone: "123" }))).toBe("err.phone");
    expect(await key(updateOrgRegional(e, { countryCode: "PY", currency: "ZZZ", timezone: "UTC" }))).toBe("err.currency");
    expect((await db.user.findUniqueOrThrow({ where: { id: e.userId } })).locale).toBe("es"); // nada se guardó
  });
  it("la organización cambia de país: cambian los precios de plan disponibles (sin conversión automática)", async () => {
    const e = await mk("a@x.com");
    expect(await priceFor("START", "PY")).not.toBeNull();
    await updateOrgRegional(e, { countryCode: "AR", currency: "ARS", timezone: "America/Argentina/Buenos_Aires" });
    expect(await db.organization.findUniqueOrThrow({ where: { id: e.organizationId } })).toMatchObject({ countryCode: "AR", currency: "ARS" });
    await expect(startCheckout({ ...e, planId: "START", consentRecurring: false, returnUrl: "http://localhost" })).rejects.toThrow(/precio definido para tu país/);
    expect(await db.auditLog.count({ where: { action: "regional.org_update" } })).toBe(1);
  });
});
