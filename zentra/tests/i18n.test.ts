import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { D } from "@/lib/i18n/dictionary";
import { DEFAULT_LOCALE, LOCALES, makeT, resolveLocale, translate } from "@/lib/i18n";
import { PLAN_CATALOG, PLAN_IDS } from "@/server/billing/plans";
import { systemPrompt } from "@/server/ai/assistant";

const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

describe("diccionario", () => {
  it("cada clave tiene español, inglés y portugués no vacíos, con los mismos {marcadores}", () => {
    for (const [k, row] of Object.entries(D)) {
      expect(row, k).toHaveLength(3);
      row.forEach((s, i) => { expect(s.trim().length > 0, `${k}[${i}] vacío`).toBe(true); });
      expect(vars(row[1]), `${k} en`).toBe(vars(row[0])); expect(vars(row[2]), `${k} pt`).toBe(vars(row[0]));
    }
  });
  it("no hay traducciones copiadas del español (salvo siglas y nombres propios)", () => {
    const same = Object.entries(D).filter(([, r]) => r[1] === r[0]).map(([k]) => k);
    const allowed = new Set(["nav.ai", "nav.admin"]);
    const suspicious = same.filter((k) => !allowed.has(k) && !/^(metric\.|kpi\.roas$|obj\.LEADS|common\.noData|landing\.kicker|chart\.)/.test(k) && D[k][0].length > 12);
    expect(suspicious).toEqual([]);
  });
  it("todo plan tiene descripción y un texto por cada característica", () => {
    for (const id of PLAN_IDS) {
      expect(D[`plan.${id}.desc`]).toBeTruthy();
      PLAN_CATALOG[id].highlights.forEach((_, i) => expect(D[`plan.${id}.h${i + 1}`], `${id}.h${i + 1}`).toBeTruthy());
      expect(D[`plan.${id}.h${PLAN_CATALOG[id].highlights.length + 1}`]).toBeUndefined(); // sin textos sobrantes
    }
  });
  it("toda clave de traducción usada en el código existe en el diccionario", () => {
    const prefixes = new Set(Object.keys(D).map((k) => k.split(".")[0]));
    const files: string[] = [];
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : /\.(tsx?|ts)$/.test(f) && files.push(p); } };
    walk("src");
    const missing: string[] = [];
    for (const f of files.filter((f) => !f.endsWith("dictionary.ts"))) {
      for (const m of readFileSync(f, "utf8").matchAll(/["'`]((?:[a-z]+)\.[A-Za-z0-9_.${}]+)["'`]/g)) {
        const key = m[1];
        if (!prefixes.has(key.split(".")[0]) || key.includes("${") || /\.(png|svg|json|ts|tsx|css|js)$/.test(key)) continue;
        if (!D[key]) missing.push(`${f}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe("traducción", () => {
  it("traduce, sustituye marcadores y cae al español o a la clave", () => {
    expect(translate("en", "nav.dashboard")).toBe("Dashboard");
    expect(translate("pt", "nav.dashboard")).toBe("Painel");
    expect(translate("es", "dash.hello", { name: "Ana" })).toBe("Hola, Ana");
    expect(translate("pt", "dash.hello", { name: "Ana" })).toBe("Olá, Ana");
    expect(translate("en", "clave.inexistente")).toBe("clave.inexistente");
    expect(translate("en", "filter.days", { n: 7 })).toBe("7 days");
    expect(makeT("pt")("bill.title")).toBe("Plano e pagamentos");
  });
  it("el idioma inicial es el español y se resuelve: preferencia del usuario > cookie > español (nunca por IP)", () => {
    expect(DEFAULT_LOCALE).toBe("es"); expect([...LOCALES]).toEqual(["es", "en", "pt"]);
    expect(resolveLocale({})).toBe("es");
    expect(resolveLocale({ cookie: "en" })).toBe("en");
    expect(resolveLocale({ userLocale: "pt", cookie: "en" })).toBe("pt");
    expect(resolveLocale({ userLocale: "fr", cookie: "en" })).toBe("en"); // idioma no soportado: se ignora
    expect(resolveLocale({ userLocale: "xx", cookie: "zz" })).toBe("es");
  });
  it("la IA responde en el idioma del usuario", () => {
    expect(systemPrompt("PYG")).toContain("español");
    expect(systemPrompt("USD", new Date(), "en")).toContain("inglés");
    expect(systemPrompt("BRL", new Date(), "pt")).toContain("portugués");
  });
});
