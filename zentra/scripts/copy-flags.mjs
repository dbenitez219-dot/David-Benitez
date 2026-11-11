// Copia las banderas SVG (paquete country-flag-icons, licencia MIT) a public/flags y genera la lista de códigos.
// Se ejecuta en `postinstall` y antes de `build`. Los SVG no se suben al repositorio.
import { copyFileSync, mkdirSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const src = join("node_modules", "country-flag-icons", "3x2");
if (!existsSync(src)) { console.warn("country-flag-icons no está instalado; se omiten las banderas."); process.exit(0); }
const out = join("public", "flags");
mkdirSync(out, { recursive: true });
const codes = readdirSync(src).filter((f) => /^[A-Z]{2}\.svg$/.test(f)).map((f) => f.slice(0, 2));
for (const c of codes) copyFileSync(join(src, `${c}.svg`), join(out, `${c.toLowerCase()}.svg`));
writeFileSync(join("src", "lib", "flag-codes.json"), JSON.stringify(codes.sort()) + "\n");
console.log(`✔ ${codes.length} banderas copiadas a public/flags`);
