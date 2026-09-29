// @ts-nocheck
// CristalAuto · función del servidor (Supabase Edge Function)
// - action "sale":  correo + aviso por cada venta (la app la llama al registrar una venta)
// - action "vapid": entrega la clave pública para activar notificaciones en el teléfono
// - action "test":  manda un aviso de prueba
// - action "cron":  la llama el programador cada 5 minutos → resumen 20:00, aviso 07:30 y recordatorio 1 hora antes de cada colocación
// Configuración (Supabase → Edge Functions → Secrets):  RESEND_API_KEY (obligatoria)
//   opcionales: NOTIFY_TO (correos separados por coma), MAIL_FROM
import { createClient } from "npm:@supabase/supabase-js@2";
// web-push se carga recién cuando hace falta: si fallara, la función igual arranca y lo informa
let _wp: any = null;
async function wp() { if (!_wp) { const m: any = await import("npm:web-push@3.6.7"); _wp = m.default || m; } return _wp; }

// <<PURE-START>> (lógica sin dependencias: se prueba por separado)
const TZ = "America/Asuncion";
function localNow(d) {
  d = d || new Date();
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const g = (t) => p.find((x) => x.type === t).value;
  return { date: g("year") + "-" + g("month") + "-" + g("day"), minutes: parseInt(g("hour")) * 60 + parseInt(g("minute")) };
}
const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const gs = (n) => "Gs. " + Math.round(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const dmy = (iso) => (iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : "");
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const paidOf = (s) => (s.pays || []).reduce((a, p) => a + p.amount, 0);
const saldoOf = (s) => s.total - paidOf(s);
function stockMap(moves) {
  const m = {};
  for (const v of moves || []) m[v.pid] = (m[v.pid] || 0) + (v.type === "out" ? -v.qty : v.qty);
  return m;
}
function lowStock(products, moves) {
  const m = stockMap(moves);
  return (products || []).map((p) => ({ code: p.code, name: p.name, stock: m[p.id] || 0, min: p.min })).filter((p) => p.stock <= p.min).sort((a, b) => a.stock - b.stock);
}
const wrap = (title, body) =>
  `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#0f172a"><div style="background:#0f4c81;color:#fff;padding:14px 18px;border-radius:10px 10px 0 0"><b style="font-size:18px">🚗 CristalAuto Parabrisas</b><br><span style="opacity:.9">${esc(title)}</span></div><div style="border:1px solid #e2e8f0;border-top:0;padding:16px 18px;border-radius:0 0 10px 10px">${body}</div></div>`;
const table = (head, rows) =>
  `<table style="width:100%;border-collapse:collapse;font-size:14px"><tr>${head.map((h) => `<th style="text-align:left;padding:6px;border-bottom:2px solid #e2e8f0">${h}</th>`).join("")}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td style="padding:6px;border-bottom:1px solid #e2e8f0">${c}</td>`).join("")}</tr>`).join("")}</table>`;

function saleMsg(s) {
  const pagado = paidOf(s), saldo = s.total - pagado, ganancia = s.total - (s.cost || 0);
  const html = wrap("Nueva venta #" + s.n,
    `<p style="font-size:22px;margin:0 0 8px"><b>${gs(s.total)}</b></p><p style="margin:0 0 10px"><b>${esc(s.clientName)}</b>${s.vehicle ? " · " + esc(s.vehicle) : ""}<br>${dmy(s.date)}${s.tech ? " · Colocó: " + esc(s.tech) : ""}</p>` +
    table(["Detalle", "Cant.", "Total"], (s.items || []).map((i) => [esc(i.name), String(i.qty), gs(i.qty * i.unit)])) +
    `<p style="margin:12px 0 0">Cobrado: <b>${gs(pagado)}</b>${(s.pays || []).length ? " (" + s.pays.map((p) => esc(p.method)).filter((v, k, a) => a.indexOf(v) === k).join(", ") + ")" : ""}` +
    (saldo > 0 ? `<br><span style="color:#b91c1c">Saldo a crédito: <b>${gs(saldo)}</b>${s.due ? " · vence " + dmy(s.due) : ""}</span>` : "") +
    `<br>Ganancia bruta: <b>${gs(ganancia)}</b>${s.inv && s.inv.no ? "<br>Factura N° " + esc(s.inv.no) : ""}${s.note ? "<br>Nota: " + esc(s.note) : ""}</p>`);
  const first = (s.items || [])[0];
  return { subject: `Venta #${s.n}: ${gs(s.total)} · ${s.clientName}`, html, push: { title: `Venta #${s.n} · ${gs(s.total)}`, body: `${s.clientName}${first ? " · " + first.name : ""}`, url: "./" } };
}
function apptMsg(a) {
  const html = wrap("Colocación en 1 hora",
    `<p style="font-size:22px;margin:0 0 8px"><b>${esc(a.time)}</b> · ${esc(a.clientName)}</p><p style="margin:0">${esc(a.vehicle || "")}${a.tech ? "<br>Colocador: " + esc(a.tech) : ""}${a.phone ? "<br>Tel: " + esc(a.phone) : ""}` +
    `${a.domicilio ? "<br>🚗 A domicilio" + (a.address ? ": " + esc(a.address) : "") : ""}${(a.items || []).length ? "<br>" + a.items.map((i) => esc(i.name)).join(" · ") : ""}${a.note ? "<br>📝 " + esc(a.note) : ""}</p>`);
  return { subject: `⏰ Colocación a las ${a.time}: ${a.clientName}`, html, push: { title: `⏰ En 1 hora · ${a.time}`, body: `${a.clientName}${a.vehicle ? " · " + a.vehicle : ""}${a.domicilio ? " · domicilio" : ""}`, url: "./" } };
}
// Colocaciones que faltan 60 minutos o menos (y todavía no empezaron)
function apptDue(appts, now) {
  return (appts || []).filter((a) => {
    if (a.status !== "agendado" || a.date !== now.date || !a.time) return false;
    const [h, m] = a.time.split(":").map(Number);
    const until = h * 60 + m - now.minutes;
    return until <= 60 && until > 0;
  });
}
function summaryMsg(d, date) {
  const S = d.sales || [], V = S.filter((s) => s.date === date);
  const cobros = S.flatMap((s) => (s.pays || []).map((p) => ({ ...p, s }))).filter((p) => p.date === date);
  const by = (m) => cobros.filter((p) => p.method === m).reduce((a, p) => a + p.amount, 0);
  const cobrado = cobros.reduce((a, p) => a + p.amount, 0), ef = by("Efectivo"), tr = by("Transferencia");
  const G = (d.expenses || []).filter((g) => g.date === date);
  const gEf = G.filter((g) => g.via !== "Itaú").reduce((a, g) => a + g.amount, 0), gIt = G.filter((g) => g.via === "Itaú").reduce((a, g) => a + g.amount, 0);
  const tot = V.reduce((a, s) => a + s.total, 0), gan = V.reduce((a, s) => a + s.total - (s.cost || 0), 0);
  const cd = (d.cashdays || []).find((c) => c.date === date);
  const pend = S.filter((s) => saldoOf(s) > 0), porCobrar = pend.reduce((a, s) => a + saldoOf(s), 0), venc = pend.filter((s) => s.due && s.due < date).reduce((a, s) => a + saldoOf(s), 0);
  const man = addDays(date, 1), citas = (d.appts || []).filter((a) => a.date === man && a.status !== "cancelado").sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  const low = lowStock(d.products, d.moves);
  const html = wrap("Resumen del día · " + dmy(date),
    `<p style="font-size:22px;margin:0">Ventas: <b>${gs(tot)}</b> <span style="font-size:14px">(${V.length})</span></p><p style="margin:4px 0 12px">Ganancia bruta: <b>${gs(gan)}</b></p>` +
    (V.length ? table(["N°", "Cliente", "Total"], V.map((s) => ["#" + s.n, esc(s.clientName), gs(s.total)])) : "<p>No hubo ventas hoy.</p>") +
    `<h3 style="margin:16px 0 4px">Caja</h3><p style="margin:0">Cobrado: <b>${gs(cobrado)}</b> · Efectivo ${gs(ef)} · Transferencias (Itaú) ${gs(tr)}${cobrado - ef - tr ? " · Otros " + gs(cobrado - ef - tr) : ""}<br>Gastos: efectivo ${gs(gEf)} · Itaú ${gs(gIt)}<br>` +
    (cd ? (cd.closed ? `Caja cerrada · contado ${gs(cd.counted)} · diferencia <b>${gs(cd.counted - cd.expected)}</b>` : "⚠️ La caja de hoy <b>no fue cerrada</b>.") : "⚠️ La caja de hoy no se abrió.") + `</p>` +
    `<h3 style="margin:16px 0 4px">Créditos</h3><p style="margin:0">Por cobrar: <b>${gs(porCobrar)}</b>${venc ? ` · <span style="color:#b91c1c">vencido ${gs(venc)}</span>` : ""}</p>` +
    `<h3 style="margin:16px 0 4px">Mañana (${dmy(man)}): ${citas.length} colocaciones</h3>` + (citas.length ? table(["Hora", "Cliente", "Vehículo"], citas.map((a) => [esc(a.time), esc(a.clientName) + (a.domicilio ? " 🚗" : ""), esc(a.vehicle || "")])) : "<p>Sin colocaciones agendadas todavía.</p>") +
    `<h3 style="margin:16px 0 4px">Stock bajo: ${low.length} modelos</h3>` + (low.length ? `<p style="margin:0">${low.slice(0, 10).map((p) => esc(p.code) + " (" + p.stock + ")").join(" · ")}${low.length > 10 ? "…" : ""}</p>` : ""));
  return { subject: `Resumen del día ${dmy(date)}: ${gs(tot)} en ${V.length} ventas`, html, push: { title: `Resumen ${dmy(date)}`, body: `${V.length} ventas · ${gs(tot)} · cobrado ${gs(cobrado)}`, url: "./" } };
}
function morningMsg(d, date) {
  const lim = addDays(date, 5);
  const cred = (d.sales || []).filter((s) => saldoOf(s) > 0 && s.due && s.due <= lim).sort((a, b) => a.due.localeCompare(b.due));
  const low = lowStock(d.products, d.moves);
  const hoy = (d.appts || []).filter((a) => a.date === date && a.status !== "cancelado").sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  const seg = (d.leads || []).filter((l) => !["ganado", "perdido"].includes(l.status) && l.follow && l.follow <= date);
  if (!cred.length && !low.length && !hoy.length && !seg.length) return null;
  const dias = (due) => { const n = Math.round((new Date(due + "T12:00:00Z") - new Date(date + "T12:00:00Z")) / 86400000); return n < 0 ? `<span style="color:#b91c1c">vencido hace ${-n} d</span>` : n === 0 ? "vence HOY" : `vence en ${n} d`; };
  const html = wrap("Buen día · " + dmy(date),
    `<h3 style="margin:0 0 4px">📅 Colocaciones de hoy: ${hoy.length}</h3>` + (hoy.length ? table(["Hora", "Cliente", "Vehículo"], hoy.map((a) => [esc(a.time), esc(a.clientName) + (a.domicilio ? " 🚗" : ""), esc(a.vehicle || "")])) : "<p style='margin:0'>Ninguna.</p>") +
    `<h3 style="margin:16px 0 4px">💳 Créditos por vencer (5 días) o vencidos: ${cred.length}</h3>` + (cred.length ? table(["Cliente", "Vencimiento", "Saldo"], cred.map((s) => [esc(s.clientName), dmy(s.due) + " · " + dias(s.due), gs(saldoOf(s))])) + "<p style='margin:6px 0 0'>Escribile al cliente para recordarle el pago.</p>" : "<p style='margin:0'>Ninguno.</p>") +
    `<h3 style="margin:16px 0 4px">⚠️ Stock bajo: ${low.length}</h3>` + (low.length ? table(["Modelo", "Stock", "Mínimo"], low.slice(0, 25).map((p) => [esc(p.code) + "<br><span style='color:#64748b'>" + esc(p.name) + "</span>", String(p.stock), String(p.min)])) : "<p style='margin:0'>Todo con stock suficiente.</p>") +
    `<h3 style="margin:16px 0 4px">💬 Consultas para seguir hoy: ${seg.length}</h3>` + (seg.length ? table(["Cliente", "Necesita", "Origen"], seg.map((l) => [esc(l.name), esc(l.interest), esc(l.source)])) : "<p style='margin:0'>Ninguna.</p>"));
  const partes = [];
  if (cred.length) partes.push(`${cred.length} crédito${cred.length > 1 ? "s" : ""} por vencer`);
  if (low.length) partes.push(`${low.length} con stock bajo`);
  if (hoy.length) partes.push(`${hoy.length} colocación${hoy.length > 1 ? "es" : ""} hoy`);
  if (seg.length) partes.push(`${seg.length} consultas para seguir`);
  return { subject: "Buen día: " + partes.join(" · "), html, push: { title: "Buen día · CristalAuto", body: partes.join(" · "), url: "./" } };
}
// <<PURE-END>>

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });

function serviceKey() {
  const k = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); if (k) return k;
  try { const o = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}"); return o.default || Object.values(o)[0] || null; } catch (_) { return null; }
}
let _admin: any = null;
function db() {
  if (!_admin) {
    const key = serviceKey();
    if (!key) throw new Error("La función no encontró la clave de servicio de Supabase");
    _admin = createClient(Deno.env.get("SUPABASE_URL")!, key, { auth: { persistSession: false } });
  }
  return _admin;
}
const RESEND = Deno.env.get("RESEND_API_KEY");
const TO = (Deno.env.get("NOTIFY_TO") || "cristalauto95@gmail.com").split(",").map((x) => x.trim()).filter(Boolean);
const FROM = Deno.env.get("MAIL_FROM") || "CristalAuto <onboarding@resend.dev>";

async function secret(key: string) {
  const { data } = await db().from("app_secrets").select("value").eq("key", key).maybeSingle();
  return data ? data.value : null;
}
async function loadCols(cols: string[]) {
  const out: Record<string, any[]> = {};
  for (const c of cols) out[c] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db().from("records").select("collection,data").in("collection", cols).range(from, from + 999);
    if (error) throw error;
    for (const r of data) out[r.collection].push(r.data);
    if (data.length < 1000) break;
  }
  return out;
}
async function vapidKeys() {
  let pub = await secret("vapid_public"), priv = await secret("vapid_private");
  if (!pub || !priv) {
    const k = (await wp()).generateVAPIDKeys(); pub = k.publicKey; priv = k.privateKey;
    await db().from("app_secrets").upsert([{ key: "vapid_public", value: pub }, { key: "vapid_private", value: priv }]);
  }
  return { pub, priv };
}
async function sendMail(subject: string, html: string) {
  if (!RESEND) throw new Error("Falta la clave RESEND_API_KEY en los Secrets de la función");
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: "Bearer " + RESEND, "Content-Type": "application/json" }, body: JSON.stringify({ from: FROM, to: TO, subject, html }) });
  if (!r.ok) throw new Error("Resend " + r.status + ": " + (await r.text()));
}
async function sendPush(payload: unknown) {
  const { data } = await db().from("records").select("data").eq("collection", "push_subs");
  const subs = (data || []).map((r: any) => r.data).filter((s: any) => s && s.endpoint);
  if (!subs.length) return { sent: 0, total: 0 };
  const { pub, priv } = await vapidKeys();
  const webpush = await wp();
  webpush.setVapidDetails("mailto:" + TO[0], pub, priv);
  let sent = 0;
  for (const s of subs) {
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(payload)); sent++; }
    catch (e: any) { if (e && (e.statusCode === 404 || e.statusCode === 410)) await db().from("records").delete().eq("collection", "push_subs").eq("data->>endpoint", s.endpoint); }
  }
  return { sent, total: subs.length };
}
// Reserva la clave antes de enviar: así un aviso nunca sale dos veces aunque dos ejecuciones se pisen.
async function claim(key: string) {
  const { error } = await db().from("notif_log").insert({ key });
  if (!error) return true;
  if ((error as any).code === "23505") return false;
  throw error;
}
async function release(key: string) { await db().from("notif_log").delete().eq("key", key); }
async function deliver(msg: any) {
  const res: any = { mail: null, push: null };
  try { await sendMail(msg.subject, msg.html); res.mail = "ok"; } catch (e: any) { res.mail = String(e.message || e); }
  try { res.push = await sendPush(msg.push); } catch (e: any) { res.push = String(e.message || e); }
  return res;
}
async function once(key: string, build: () => Promise<any> | any) {
  if (!(await claim(key))) return { skipped: "ya enviado" };
  try {
    const msg = await build(); if (!msg) return { skipped: "nada para avisar" };
    const r = await deliver(msg);
    if (r.mail !== "ok" && !(r.push && r.push.sent)) { await release(key); return { error: r }; }
    return r;
  } catch (e) { await release(key); throw e; }
}

async function isCron(req: Request) {
  const h = req.headers.get("x-cron-secret"); if (!h) return false;
  const s = await secret("cron_secret"); return !!s && h === s;
}
async function requireUser(req: Request) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) throw Object.assign(new Error("Falta iniciar sesión"), { status: 401 });
  const { data, error } = await db().auth.getUser(token);
  if (error || !data.user) throw Object.assign(new Error("Sesión inválida"), { status: 401 });
  return data.user;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method === "GET") return json({ ok: true, funcion: "cristalauto", tiene_url: !!Deno.env.get("SUPABASE_URL"), tiene_clave_de_servicio: !!serviceKey(), tiene_clave_resend: !!RESEND });
  try {
    const body = await req.json().catch(() => ({}));
    const cron = await isCron(req);
    if (body.action === "cron") {
      if (!cron) return json({ error: "No autorizado" }, 403);
      const now = localNow(), out: Record<string, unknown> = { now };
      const { appts } = await loadCols(["appts"]);
      for (const a of apptDue(appts, now)) out["appt-" + a.id] = await once(`appt-${a.id}-${a.date}-${a.time}`, () => apptMsg(a));
      if (now.minutes >= 450 && now.minutes < 720) out.morning = await once("morning-" + now.date, async () => morningMsg(await loadCols(["products", "moves", "sales", "leads", "appts"]), now.date));
      if (now.minutes >= 1200 && now.minutes < 1439) out.summary = await once("summary-" + now.date, async () => summaryMsg(await loadCols(["products", "moves", "sales", "expenses", "appts", "cashdays"]), now.date));
      return json(out);
    }
    if (!cron) await requireUser(req);
    if (body.action === "vapid") return json({ key: (await vapidKeys()).pub });
    if (body.action === "sale") {
      const { data, error } = await db().from("records").select("data").eq("collection", "sales").eq("id", String(body.id)).maybeSingle();
      if (error) throw error; if (!data) return json({ error: "Venta no encontrada" }, 404);
      return json(await once("sale-" + body.id, () => saleMsg(data.data)));
    }
    if (body.action === "test") {
      return json(await deliver({ subject: "Prueba de avisos CristalAuto", html: wrap("Prueba", "<p>Si ves este correo, los avisos funcionan ✅</p>"), push: { title: "CristalAuto", body: "Prueba de aviso ✅", url: "./" } }));
    }
    return json({ error: "Acción desconocida" }, 400);
  } catch (e: any) {
    return json({ error: String((e && e.message) || e) }, (e && e.status) || 500);
  }
});
