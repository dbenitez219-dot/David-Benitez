// @ts-nocheck
// CristalAuto · sifen (Supabase Edge Function, nombre exacto: sifen)
// Conexión con SIFEN (DNIT). Esta primera versión solo PRUEBA LA CONEXIÓN:
//   action "diagnostico"  → lee el certificado de los Secrets y muestra de quién es y hasta cuándo vale
//   action "consultaRuc"  → consulta un RUC en el ambiente de pruebas (TEST) usando el certificado
// Secrets que usa (Supabase → Edge Functions → Secrets): SIFEN_P12_B64 (certificado en base64) y SIFEN_P12_PASS (su contraseña).
// El certificado y la contraseña nunca salen de acá ni se devuelven en ninguna respuesta.
import { createClient } from "npm:@supabase/supabase-js@2";
import forge from "npm:node-forge@1.3.1";
import https from "node:https";
import { Buffer } from "node:buffer";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const AUTORIZADOS = (Deno.env.get("NOTIFY_TO") || "cristalauto95@gmail.com").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);

const HOSTS = { test: "sifen-test.set.gov.py", prod: "sifen.set.gov.py" };

function serviceKey() {
  const k = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); if (k) return k;
  try { const o = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}"); return o.default || Object.values(o)[0] || null; } catch (_) { return null; }
}
async function requireUser(req) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) throw Object.assign(new Error("Falta iniciar sesión"), { status: 401 });
  const key = serviceKey(); if (!key) throw new Error("La función no encontró la clave de servicio de Supabase");
  const { data, error } = await createClient(Deno.env.get("SUPABASE_URL"), key, { auth: { persistSession: false } }).auth.getUser(token);
  if (error || !data.user) throw Object.assign(new Error("Sesión inválida"), { status: 401 });
  if (!AUTORIZADOS.includes((data.user.email || "").toLowerCase())) throw Object.assign(new Error("Usuario no autorizado"), { status: 403 });
  return data.user;
}

/* Abre el certificado .p12 guardado en los Secrets y devuelve la clave y el certificado en formato PEM */
function abrirCertificado() {
  const b64 = Deno.env.get("SIFEN_P12_B64"), pass = Deno.env.get("SIFEN_P12_PASS");
  if (!b64) throw new Error("Falta el secreto SIFEN_P12_B64 (el certificado)");
  if (pass === undefined || pass === null) throw new Error("Falta el secreto SIFEN_P12_PASS (la contraseña del certificado)");
  let p12;
  try { p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.decode64(b64.replace(/\s+/g, ""))), false, pass); }
  catch (e) { throw new Error("No se pudo abrir el certificado: revisá que la contraseña sea correcta y que el certificado esté completo (" + (e && e.message ? e.message : e) + ")"); }
  let key = null, cert = null;
  for (const sc of p12.safeContents) for (const bag of sc.safeBags) { if (bag.key && !key) key = bag.key; if (bag.cert && !cert) cert = bag.cert; }
  if (!key || !cert) throw new Error("El certificado no trae la clave privada o el certificado");
  return { keyPem: forge.pki.privateKeyToPem(key), certPem: forge.pki.certificateToPem(cert), cert };
}
function infoCertificado(cert) {
  const campo = (n) => (cert.subject.getField(n) || {}).value || "";
  return {
    titular: campo("CN"), serie: campo("serialNumber"), emisor: (cert.issuer.getField("CN") || {}).value || "",
    atributos_titular: cert.subject.attributes.map((a) => (a.shortName || a.name || a.type) + "=" + a.value).join(" | "),
    valido_desde: cert.validity.notBefore.toISOString().slice(0, 10), valido_hasta: cert.validity.notAfter.toISOString().slice(0, 10),
    vigente: new Date() >= cert.validity.notBefore && new Date() <= cert.validity.notAfter,
  };
}

/* Envía un mensaje SOAP a SIFEN con TLS 1.2 y autenticación mutua (el certificado va en la conexión) */
function soap(host, path, body, { keyPem, certPem }) {
  return new Promise((resolve, reject) => {
    const req = https.request({ host, port: 443, path, method: "POST", key: keyPem, cert: certPem, minVersion: "TLSv1.2", timeout: 60000,
      headers: { "Content-Type": "application/xml; charset=utf-8", "User-Agent": "CristalAuto", "Content-Length": Buffer.byteLength(body) } }, (res) => {
      let data = ""; res.setEncoding("utf8"); res.on("data", (c) => data += c); res.on("end", () => resolve({ status: res.statusCode, location: res.headers.location || "", servidor: res.headers.server || "", body: data }));
    });
    req.on("timeout", () => req.destroy(new Error("Tiempo de espera agotado hablando con SIFEN")));
    req.on("error", reject); req.write(body); req.end();
  });
}
const envelope = (inner) => `<env:Envelope xmlns:env="http://www.w3.org/2003/05/soap-envelope"><env:Header/><env:Body>${inner}</env:Body></env:Envelope>`;
const tag = (xml, name) => { const m = xml.match(new RegExp("<(?:\\w+:)?" + name + "[^>]*>([\\s\\S]*?)</(?:\\w+:)?" + name + ">")); return m ? m[1].trim() : ""; };

async function consultaRuc(body) {
  const env = body.ambiente === "prod" ? "prod" : "test";
  const ruc = String(body.ruc || "80139512").replace(/\D/g, "").slice(0, 12);
  if (!ruc) throw Object.assign(new Error("Falta el RUC (sin dígito verificador)"), { status: 400 });
  const cert = abrirCertificado();
  const xml = envelope(`<rEnviConsRUC xmlns="http://ekuatia.set.gov.py/sifen/xsd"><dId>1</dId><dRUCCons>${ruc}</dRUCCons></rEnviConsRUC>`);
  const r = await soap(HOSTS[env], "/de/ws/consultas/consulta-ruc.wsdl", xml, cert);
  return { ambiente: env, http: r.status, redireccion: r.location, servidor: r.servidor, codigo: tag(r.body, "dCodRes"), mensaje: tag(r.body, "dMsgRes"), razonSocial: tag(r.body, "dRazCons"), estado: tag(r.body, "dDesEstCons"), respuesta: r.body.slice(0, 1500) || "(sin contenido)" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method === "GET") return json({ ok: true, funcion: "sifen", tiene_certificado: !!Deno.env.get("SIFEN_P12_B64"), tiene_clave_certificado: Deno.env.get("SIFEN_P12_PASS") !== undefined, tiene_clave_de_servicio: !!serviceKey() });
  try {
    await requireUser(req);
    const body = await req.json().catch(() => ({}));
    if (body.action === "diagnostico") return json({ ok: true, certificado: infoCertificado(abrirCertificado().cert) });
    if (body.action === "consultaRuc") return json({ ok: true, ...(await consultaRuc(body)) });
    return json({ error: "Acción desconocida" }, 400);
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, (e && e.status) || 500);
  }
});
