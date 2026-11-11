/**
 * Prueba de humo de extremo a extremo (navegador real) contra un servidor de ZENTRA ya en marcha.
 *   BASE_URL=http://localhost:3100 DATABASE_URL=... node e2e/smoke.cjs
 * Requiere Playwright con Chromium (`npx playwright install chromium`) y acceso a la BASE DE DATOS DE PRUEBAS
 * (para leer/crear tokens, ya que no se envían correos reales). NO la apuntes a producción.
 * Servidor sugerido: CRON_SECRET=$(openssl rand -hex 32) APP_URL=https://localhost:3100 ALLOW_SIMULATED_PAYMENTS=true npm start -- -p 3100
 */
const { chromium } = require("playwright");
const { PrismaClient } = require("@prisma/client");
const { createHash, createHmac, randomBytes } = require("node:crypto");

const BASE = process.env.BASE_URL || "http://localhost:3100";
const db = new PrismaClient();
const results = [];
const check = (name, ok, extra = "") => { results.push({ name, ok }); console.log(`${ok ? "✔" : "✘"} ${name}${extra ? " — " + extra : ""}`); };
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function totp(secret, ms = Date.now()) {
  let bits = 0, v = 0; const key = [];
  for (const c of secret) { v = (v << 5) | B32.indexOf(c); bits += 5; if (bits >= 8) { key.push((v >>> (bits - 8)) & 255); bits -= 8; } }
  const ctr = Buffer.alloc(8); ctr.writeBigUInt64BE(BigInt(Math.floor(ms / 30000)));
  const h = createHmac("sha1", Buffer.from(key)).update(ctr).digest(); const o = h[h.length - 1] & 15;
  return String((((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, "0");
}

(async () => {
  await db.rateLimit.deleteMany(); // base de pruebas: se reinician los límites de intentos para poder repetir el recorrido
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" || /Content Security Policy/i.test(m.text())) problems.push(m.text().slice(0, 140)); });
  const email = `smoke${Date.now()}@test.com`, PW = "Correcta12345", PW2 = "NuevaClave98765";
  const go = (p) => page.goto(BASE + p, { waitUntil: "load" });

  // ── Seguridad básica (sin sesión) ──
  const hdr = (await ctx.request.get(BASE + "/login")).headers();
  check("encabezados de seguridad (CSP con nonce, HSTS, X-Frame-Options, nosniff)", /nonce-/.test(hdr["content-security-policy"] || "") && !!hdr["strict-transport-security"] && hdr["x-frame-options"] === "DENY" && hdr["x-content-type-options"] === "nosniff");
  check("/api/health responde", (await ctx.request.get(BASE + "/api/health")).status() === 200);
  check("/api/ready responde con la base de datos", (await ctx.request.get(BASE + "/api/ready")).status() === 200);
  check("cron sin clave → 401", (await ctx.request.get(BASE + "/api/cron/billing")).status() === 401);
  check("webhook con firma falsa → 400", (await ctx.request.post(BASE + "/api/billing/webhook/simulated", { data: "{}" })).status() === 400);
  check("exportar sin sesión → 401", (await ctx.request.get(BASE + "/api/account/export")).status() === 401);
  check("panel /admin sin sesión no se muestra", new URL((await go("/admin"), page.url())).pathname === "/login");

  // ── Registro internacional e idiomas ──
  await go("/");
  await page.click('button:has-text("English")'); await page.waitForTimeout(700);
  check("portada cambia a inglés", /Smarter/.test(await page.locator("h1").innerText()));
  await go("/register");
  await page.click("button[aria-haspopup=listbox] >> nth=0"); await page.fill('input[placeholder="Search country or code…"]', "paraguay");
  check("buscador de países con bandera", (await page.locator("[role=option] img").count()) === 1);
  await page.click("[role=option]");
  await page.fill("[name=name]", "Smoke Test"); await page.fill("[name=organizationName]", "Smoke Org"); await page.fill("[name=phone]", "123");
  await page.fill("[name=email]", email); await page.fill("[name=password]", PW);
  await page.click('button.btn:has-text("Create account")'); await page.waitForSelector("form [role=alert]");
  check("teléfono inválido se rechaza y conserva lo escrito", (await page.inputValue("[name=name]")) === "Smoke Test");
  await page.fill("[name=phone]", "0981 123 456"); await page.click('button.btn:has-text("Create account")'); await page.waitForURL("**/dashboard");
  check("registro internacional → panel", true);
  const u = await db.user.findUnique({ where: { email } });
  check("país, moneda, zona y teléfono E.164 guardados", u && u.countryCode === "PY" && u.phone === "+595981123456" && u.timezone === "America/Asuncion");

  // ── Panel, datos de demostración, anuncios ──
  await page.click("text=Load demo data"); await page.waitForSelector("text=Daily trend");
  check("panel con datos de demostración y aviso", (await page.locator("text=DEMO DATA").count()) > 0);
  await page.hover("svg[role=img]", { position: { x: 300, y: 100 } });
  check("gráfico interactivo (tooltip)", (await page.locator(".pointer-events-none").count()) > 0);
  await go("/ads"); check("biblioteca con 12 anuncios", (await page.locator("article").count()) === 12);
  const tag = await db.ad.findFirst({ where: { organizationId: (await db.membership.findFirst({ where: { userId: u.id } })).organizationId } });
  await db.ad.update({ where: { id: tag.id }, data: { name: "<img src=x onerror=window.__xss=1>" } });
  await go("/ads"); await page.waitForTimeout(400);
  check("nombre de anuncio malicioso se muestra como texto (XSS)", !(await page.evaluate(() => window.__xss)) && (await page.locator("article h2:has-text('<img')").count()) === 1);

  // ── Pago simulado y ventas (solo si el servidor permite pagos simulados) ──
  await go("/billing");
  if ((await page.locator("text=SIMULATED PAYMENTS").count()) || (await page.locator("text=PAGOS SIMULADOS").count())) {
    await page.click('article:has-text("Business") a.btn'); await page.waitForURL("**/billing/checkout**"); await page.check("input[name=consent]"); await page.click("main form button.btn");
    await page.waitForURL("**/billing/simulated**"); await page.click("text=Simulate approved payment").catch(() => page.click("text=Simular pago aprobado"));
    await page.waitForURL("**/billing?**"); await page.waitForTimeout(500);
    check("pago simulado activa el plan", (await db.subscription.findFirst({ where: { organizationId: tag.organizationId }, orderBy: { createdAt: "desc" } })).status === "ACTIVE");
  } else check("pago simulado (omitido: servidor sin ALLOW_SIMULATED_PAYMENTS)", true);
  await go("/sales");
  check("módulo comercial disponible en Business", (await page.locator("text=Guardar venta").count()) > 0);
  await go("/settings/regional"); check("ajustes regionales", (await page.locator("input[name=timezone]").count()) > 0);

  // ── Recuperar contraseña ──
  await go("/forgot-password"); await page.fill("[name=email]", "no-existe@test.com"); await page.click("button.btn"); await page.waitForSelector("[role=status]");
  const msgUnknown = await page.locator("[role=status]").first().innerText();
  await go("/forgot-password"); await page.fill("[name=email]", email); await page.click("button.btn"); await page.waitForSelector("[role=status]");
  check("recuperar contraseña responde igual exista o no la cuenta", msgUnknown === (await page.locator("[role=status]").first().innerText()));
  const raw = randomBytes(24).toString("base64url");
  await db.authToken.create({ data: { userId: u.id, type: "RESET", tokenHash: sha256(raw), expiresAt: new Date(Date.now() + 3600e3) } });
  await go(`/reset-password?token=${raw}`); await page.fill("[name=password]", "débil"); await page.click("button.btn"); await page.waitForSelector("form [role=alert]");
  await page.fill("[name=password]", PW2); await page.click("button.btn"); await page.waitForURL("**/login**");
  check("restablecer cierra las sesiones y el enlace no se reutiliza", (await db.session.count({ where: { userId: u.id } })) === 0 && (await (await go(`/reset-password?token=${raw}`), page.locator("text=no es válido").count())) > 0);
  await go("/login"); await page.fill("[name=email]", email); await page.fill("[name=password]", PW); await page.click("button.btn");
  await page.waitForSelector("form [role=alert]"); check("contraseña anterior ya no sirve", true);
  await page.fill("[name=password]", PW2); await page.click("button.btn"); await page.waitForURL("**/dashboard"); check("inicio de sesión con la nueva contraseña", true);

  // ── Cuenta: exportar datos ──
  const exp = await ctx.request.get(BASE + "/api/account/export"); const body = await exp.text();
  check("exportar datos: JSON propio, sin contraseñas ni tokens", exp.status() === 200 && JSON.parse(body).user.email === email && !/passwordHash|argon2|accessTokenEnc|paymentMethodEnc|totpSecret/.test(body));

  // ── 2FA obligatoria para propietarios ──
  await db.user.update({ where: { id: u.id }, data: { platformRole: "SUPERADMIN" } });
  await go("/admin"); check("propietario sin 2FA es llevado a configurarla", page.url().includes("/mfa/setup"));
  const secret = (await page.locator("code").innerText()).trim();
  await page.fill("[name=code]", "000000"); await page.click("button.btn"); await page.waitForSelector("[role=alert]");
  await page.fill("[name=code]", totp(secret)); await page.click("button.btn"); await page.waitForSelector("text=códigos de recuperación");
  const codes = await page.locator("ul.grid li").allInnerTexts();
  check("2FA activada y 8 códigos de recuperación mostrados una vez", codes.length === 8);
  await go("/admin"); check("panel /admin accesible tras verificar", page.url().endsWith("/admin") && (await page.locator("text=Tareas programadas").count()) > 0);
  await page.click("text=Salir").catch(() => undefined);
  await go("/login"); await page.fill("[name=email]", email); await page.fill("[name=password]", PW2); await page.click("button.btn"); await page.waitForURL("**/dashboard");
  await go("/admin"); check("nueva sesión exige el segundo factor", page.url().includes("/mfa/verify"));
  await page.fill("[name=code]", codes[0]); await page.click("button.btn"); await page.waitForURL("**/admin");
  check("código de recuperación sirve una vez", (await db.user.findUnique({ where: { id: u.id } })).recoveryCodes.length === 7);
  await db.user.update({ where: { id: u.id }, data: { platformRole: "USER" } });

  // ── Eliminar la cuenta ──
  await go("/settings/account");
  await page.fill("[name=confirm]", email); await page.fill('[name=password] >> nth=-1', "incorrecta"); await page.click('button:has-text("Eliminar definitivamente")');
  await page.waitForSelector("form [role=alert]:has-text('contraseña')"); check("eliminar con contraseña incorrecta se rechaza", !!(await db.user.findUnique({ where: { id: u.id } })));
  await page.fill('[name=password] >> nth=-1', PW2); await page.fill("[name=confirm]", email); await page.click('button:has-text("Eliminar definitivamente")'); await page.waitForURL("**/?deleted=1");
  check("cuenta y organización eliminadas por completo", !(await db.user.findUnique({ where: { id: u.id } })) && (await db.organization.count({ where: { id: tag.organizationId } })) === 0);

  check("sin errores de consola ni violaciones de CSP en todo el recorrido", problems.length === 0, problems.slice(0, 2).join(" | "));
  await browser.close(); await db.$disconnect();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} comprobaciones correctas`);
  process.exit(failed.length ? 1 : 0);
})().catch(async (e) => { console.error("✘ ABORTADO:", e.message.split("\n")[0]); await db.$disconnect(); process.exit(2); });
