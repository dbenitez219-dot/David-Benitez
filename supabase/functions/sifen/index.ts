// @ts-nocheck
// CristalAuto · sifen (Supabase Edge Function, nombre exacto: sifen)
// Conexión con SIFEN (DNIT).
//   action "diagnostico"        → lee el certificado de los Secrets y muestra de quién es y hasta cuándo vale
//   action "diagnostico302"     → compara pedidos a la DNIT con y sin certificado
//   action "diagnosticoCliente" → control: ¿esta función envía el certificado de cliente?
//   action "consultaRuc"        → consulta un RUC en el ambiente de pruebas (TEST)
//   action "emitir" {ventaId}   → arma, firma, agrega el QR, envía a la DNIT y guarda el resultado en la venta
// Secrets (Supabase → Edge Functions → Secrets): SIFEN_P12_B64 (certificado en base64), SIFEN_P12_PASS (su contraseña),
//   SIFEN_CSC_ID (IdCSC) y SIFEN_CSC (código de seguridad del contribuyente, para el QR).
// El certificado, la contraseña y el CSC nunca se devuelven ni se escriben en ninguna respuesta ni registro.
import { createClient } from "npm:@supabase/supabase-js@2";
import forge from "npm:node-forge@1.3.1";
import https from "node:https";
import { Buffer } from "node:buffer";
import xmlgenMod from "npm:facturacionelectronicapy-xmlgen@1.0.283";
import xmlsignMod from "npm:facturacionelectronicapy-xmlsign@1.0.28";
import qrgenMod from "npm:facturacionelectronicapy-qrgen@1.0.9";
// Estas librerías están hechas para Node: según el motor, la función viene directo o dentro de ".default"
const pick = (m, f) => { for (let x = m, i = 0; x && i < 4; x = x.default, i++) if (typeof x[f] === "function") return x; throw new Error("No se pudo cargar la librería de facturación (" + f + ")"); };
const xmlgen = pick(xmlgenMod, "generateXMLDE"), xmlsign = pick(xmlsignMod, "signXML"), qrgen = pick(qrgenMod, "generateQR");

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
  let key = null; const certs = [];
  for (const sc of p12.safeContents) for (const bag of sc.safeBags) { if (bag.key && !key) key = bag.key; if (bag.cert) certs.push(bag.cert); }
  if (!key || !certs.length) throw new Error("El certificado no trae la clave privada o el certificado");
  // El certificado propio es el que corresponde a la clave privada (el archivo puede traer también los de la entidad certificadora)
  const mismoModulo = (c) => c.publicKey && c.publicKey.n && key.n && c.publicKey.n.compareTo(key.n) === 0;
  const cert = certs.find(mismoModulo) || certs[0];
  const cadena = certs.filter((c) => c !== cert);
  // Se envía primero el certificado propio y después los de la cadena (la DNIT puede necesitarlos para validarlo)
  return { keyPem: forge.pki.privateKeyToPem(key), certPem: [cert, ...cadena].map((c) => forge.pki.certificateToPem(c)).join(""), cert, cantidad: certs.length, coincideConClave: certs.some(mismoModulo) };
}
function infoCertificado(cert) {
  const campo = (n) => ((cert.subject.attributes.find((x) => x.shortName === n || x.name === n || x.type === n)) || {}).value || "";
  return {
    titular: campo("CN"), serie: campo("serialName") || campo("serialNumber") || campo("2.5.4.5"), emisor: (cert.issuer.getField("CN") || {}).value || "",
    atributos_titular: cert.subject.attributes.map((a) => (a.shortName || a.name || a.type) + "=" + a.value).join(" | "),
    valido_desde: cert.validity.notBefore.toISOString().slice(0, 10), valido_hasta: cert.validity.notAfter.toISOString().slice(0, 10),
    vigente: new Date() >= cert.validity.notBefore && new Date() <= cert.validity.notAfter,
  };
}

/* Envía un mensaje SOAP a SIFEN con TLS 1.2 y autenticación mutua (el certificado va en la conexión) */
function soap(host, path, body, cert, metodo = "POST") {
  return new Promise((resolve, reject) => {
    const opts = { host, port: 443, path, method: metodo, minVersion: "TLSv1.2", timeout: 60000, headers: { "User-Agent": "CristalAuto" } };
    if (cert) { opts.key = cert.keyPem; opts.cert = cert.certPem; }
    if (body) { opts.headers["Content-Type"] = "application/xml; charset=utf-8"; opts.headers["Content-Length"] = Buffer.byteLength(body); }
    const req = https.request(opts, (res) => {
      let data = ""; res.setEncoding("utf8"); res.on("data", (c) => data += c); res.on("end", () => resolve({ status: res.statusCode, location: res.headers.location || "", servidor: res.headers.server || "", body: data }));
    });
    req.on("timeout", () => req.destroy(new Error("Tiempo de espera agotado hablando con SIFEN")));
    req.on("error", reject); if (body) req.write(body); req.end();
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

/* Prueba controlada del redireccionamiento: el mismo pedido con certificado, sin certificado y como consulta simple (GET) */
async function diagnostico302(body) {
  const env = body.ambiente === "prod" ? "prod" : "test", host = HOSTS[env], ruta = "/de/ws/consultas/consulta-ruc.wsdl";
  const ruc = String(body.ruc || "80139512").replace(/\D/g, "").slice(0, 12);
  const xml = envelope(`<rEnviConsRUC xmlns="http://ekuatia.set.gov.py/sifen/xsd"><dId>1</dId><dRUCCons>${ruc}</dRUCCons></rEnviConsRUC>`);
  const cert = abrirCertificado();
  const resumen = (nombre, r) => ({ prueba: nombre, http: r.status, location: r.location, servidor: r.servidor, tipo: (r.body.trim().startsWith("<?xml") || r.body.includes("Envelope")) ? "SOAP/XML" : r.body.toLowerCase().includes("<html") ? "página HTML" : r.body ? "otro" : "vacío", inicio: r.body.replace(/\s+/g, " ").slice(0, 300) });
  const pruebas = [];
  for (const [nombre, c, metodo, cuerpo] of [["POST con certificado", cert, "POST", xml], ["POST sin certificado", null, "POST", xml], ["GET sin certificado", null, "GET", ""]]) {
    try { pruebas.push(resumen(nombre, await soap(host, ruta, cuerpo, c, metodo))); } catch (e) { pruebas.push({ prueba: nombre, error: String((e && e.message) || e) }); }
  }
  return { ambiente: env, url: "https://" + host + ruta, certificados_en_archivo: cert.cantidad, clave_coincide_con_certificado: cert.coincideConClave, pruebas };
}

/* ================= EMISIÓN ================= */
const db = () => createClient(Deno.env.get("SUPABASE_URL"), serviceKey(), { auth: { persistSession: false } });
async function leer(col, id) { const { data, error } = await db().from("records").select("data").eq("collection", col).eq("id", id).maybeSingle(); if (error) throw new Error("No se pudo leer " + col + ": " + error.message); return data ? data.data : null; }
async function escribir(col, id, data) { const { error } = await db().from("records").upsert({ collection: col, id, data }, { onConflict: "collection,id" }); if (error) throw new Error("No se pudo guardar " + col + ": " + error.message); }

/* Número correlativo sin repetir (actualización condicional: si otro lo tomó antes, reintenta) */
async function siguienteNumero(clave) {
  for (let i = 0; i < 6; i++) {
    const fila = await leer("fe", clave), actual = fila && fila.n ? Number(fila.n) : 0;
    if (!fila) { const { error } = await db().from("records").insert({ collection: "fe", id: clave, data: { n: 1 } }); if (!error) return 1; continue; }
    const { data, error } = await db().from("records").update({ data: { n: actual + 1 } }).eq("collection", "fe").eq("id", clave).eq("data->>n", String(actual)).select("id");
    if (!error && data && data.length) return actual + 1;
  }
  throw new Error("No se pudo reservar el número de factura (reintentá)");
}
const PAGO = { Efectivo: 1, Cheque: 2, Tarjeta: 3, Transferencia: 5 };
const limpio = (t, n = 120) => String(t ?? "").replace(/[<>&"]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);

/* Convierte la venta de la app en los datos del documento electrónico */
function armarDatos(venta, cliente, cfg, numero, ahora) {
  const fe = cfg.fe || {}, emp = cfg.empresa || {}, est = String(fe.establecimiento || "001").padStart(3, "0"), punto = String(fe.punto || "001").padStart(3, "0");
  const rucEmp = String(emp.ruc || "80139512-7").trim();
  const params = {
    version: 150, ruc: rucEmp, razonSocial: limpio(emp.razonSocial || "CRISTALAUTO E.A.S. UNIPERSONAL", 100), nombreFantasia: limpio(emp.nombre || "CristalAuto Parabrisas", 100),
    actividadesEconomicas: [{ codigo: String(fe.actividad || "45303"), descripcion: limpio(fe.actividadDescripcion || "COMERCIO DE PARTES, PIEZAS Y ACCESORIOS NUEVOS Y USADOS PARA VEHICULOS AUTOMOTORES", 300) }],
    timbradoNumero: String(fe.timbrado || "").trim(), timbradoFecha: fe.desde, tipoContribuyente: 2, tipoRegimen: Number(fe.regimen || 8),
    establecimientos: [{ codigo: est, direccion: limpio(fe.direccion || "Nicanor Rios, a cuatro cuadras de la Avda Pratt Gill", 255), numeroCasa: "0",
      departamento: 12, departamentoDescripcion: "CENTRAL", distrito: 164, distritoDescripcion: "SAN LORENZO", ciudad: 6040, ciudadDescripcion: "SAN LORENZO (MUNICIPIO)",
      telefono: String(fe.telefono || emp.tel || "").replace(/[^\d]/g, ""), email: String(fe.email || emp.email || ""), denominacion: "Casa central" }],
  };
  const docRaw = String((cliente && cliente.ruc) || "").trim(), esRuc = /^\d{5,9}-\d$/.test(docRaw), soloDig = docRaw.replace(/\D/g, "");
  const nombre = limpio((cliente && cliente.name) || venta.clientName || "", 100);
  const receptor = esRuc ? { contribuyente: true, ruc: docRaw, razonSocial: nombre, tipoOperacion: 1, pais: "PRY", paisDescripcion: "Paraguay", tipoContribuyente: 2 }
    : soloDig ? { contribuyente: false, razonSocial: nombre, tipoOperacion: 2, pais: "PRY", paisDescripcion: "Paraguay", documentoTipo: 1, documentoNumero: soloDig, tipoContribuyente: 1 }
    : { contribuyente: false, razonSocial: "Sin Nombre", tipoOperacion: 2, pais: "PRY", paisDescripcion: "Paraguay", documentoTipo: 5, documentoNumero: "0", tipoContribuyente: 1 };
  const pct = Number(venta.pct || 0);
  const items = (venta.items || []).map((i, k) => ({ codigo: String(i.id || ("I" + (k + 1))).slice(0, 20), descripcion: limpio(String(i.name || "").replace(/^\S+ — /, ""), 120) || "Item", unidadMedida: 77, cantidad: Number(i.qty), precioUnitario: Math.round(Number(i.unit)),
    descuento: pct ? Math.round(Number(i.unit) * pct / 100) : 0, ivaTipo: 1, ivaProporcion: 100, iva: 10 }));
  const total = items.reduce((a, i) => a + (i.precioUnitario - i.descuento) * i.cantidad, 0);
  const pagado = (venta.pays || []).reduce((a, p) => a + Number(p.amount || 0), 0);
  let condicion;
  if (venta.pay === "credito") {
    const dias = Math.max(1, Math.round((new Date((venta.due || venta.date) + "T12:00:00") - new Date(venta.date + "T12:00:00")) / 86400000));
    condicion = { tipo: 2, credito: { tipo: 1, plazo: dias + " días" } };
    if (pagado > 0) condicion.entregas = (venta.pays || []).map((p) => ({ tipo: PAGO[p.method] || 1, monto: String(Math.round(p.amount)), moneda: "PYG", cambio: 0 }));
  } else condicion = { tipo: 1, entregas: [{ tipo: PAGO[((venta.pays || [])[0] || {}).method] || 1, monto: String(total), moneda: "PYG", cambio: 0 }] };
  const f = ahora.toISOString().slice(0, 19);
  const data = { tipoDocumento: 1, establecimiento: est, punto, numero: String(numero).padStart(7, "0"), codigoSeguridadAleatorio: String(Math.floor(100000 + Math.random() * 899999)),
    fecha: f, tipoEmision: 1, tipoTransaccion: 1, tipoImpuesto: 1, moneda: "PYG", cliente: receptor, factura: { presencia: 1 }, condicion, items };
  return { params, data, total, ambiente: fe.ambiente === "prod" ? "prod" : "test", numeroTxt: est + "-" + punto + "-" + String(numero).padStart(7, "0") };
}

/* Agrega el QR SIN reescribir el documento firmado (la librería lo reescribe y rompe la firma, por eso solo se toma el valor) */
async function conQR(firmado, idCSC, CSC, env) {
  const tmp = await qrgen.generateQR(firmado, idCSC, CSC, env);
  const qr = (String(tmp).match(/<dCarQR>([^<]+)<\/dCarQR>/) || [])[1];
  if (!qr) throw new Error("No se pudo generar el código QR");
  return firmado.replace(/<\/rDE>\s*$/, "<gCamFuFD><dCarQR>" + qr + "</dCarQR></gCamFuFD></rDE>");
}
const resultados = (xml) => [...xml.matchAll(/<(?:\w+:)?gResProc>([\s\S]*?)<\/(?:\w+:)?gResProc>/g)].map((m) => ({ codigo: tag(m[1], "dCodRes"), mensaje: tag(m[1], "dMsgRes") }));

async function emitir(body) {
  const ventaId = String(body.ventaId || ""); if (!ventaId) throw Object.assign(new Error("Falta indicar la venta"), { status: 400 });
  const cfg = (await leer("cfg", "main")) || {}, fe = cfg.fe || {};
  const faltan = []; if (!fe.timbrado) faltan.push("número de timbrado"); if (!fe.desde) faltan.push("fecha de vigencia del timbrado");
  if (!(fe.email || (cfg.empresa || {}).email)) faltan.push("correo de la empresa (Ajustes → Empresa)"); if (!(fe.telefono || (cfg.empresa || {}).tel)) faltan.push("teléfono de la empresa (Ajustes → Empresa)");
  const idCSC = Deno.env.get("SIFEN_CSC_ID"), CSC = Deno.env.get("SIFEN_CSC"); if (!idCSC) faltan.push("secreto SIFEN_CSC_ID"); if (!CSC) faltan.push("secreto SIFEN_CSC");
  if (faltan.length) throw Object.assign(new Error("Falta cargar: " + faltan.join(", ")), { status: 400 });
  const venta = await leer("sales", ventaId); if (!venta) throw Object.assign(new Error("No se encontró la venta (esperá a que termine de sincronizar)"), { status: 404 });
  const ambiente = fe.ambiente === "prod" ? "prod" : "test";
  const previo = ambiente === "prod" ? (venta.inv || {}) : ((venta.inv || {}).test || {});
  if (previo.estado === "aprobado") return { ok: true, estado: "aprobado", yaEmitida: true, numero: previo.no, cdc: previo.cdc, ambiente };
  if (!venta.items || !venta.items.length) throw Object.assign(new Error("La venta no tiene productos"), { status: 400 });
  const cliente = venta.clientId ? await leer("clients", venta.clientId) : null;
  const cert = abrirCertificado();
  const est = String(fe.establecimiento || "001").padStart(3, "0"), punto = String(fe.punto || "001").padStart(3, "0");
  const numero = previo.numero || await siguienteNumero(ambiente + "-" + fe.timbrado + "-" + est + "-" + punto);
  const { params, data, total, numeroTxt } = armarDatos(venta, cliente, cfg, numero, new Date(Date.now() - 3 * 3600000));
  const advertencia = Math.round(total) !== Math.round(venta.total) ? "El total de la factura (" + total + ") difiere del de la venta (" + venta.total + ") por redondeo del descuento." : "";
  const xml = await xmlgen.generateXMLDE(params, data, { test: ambiente !== "prod" });
  const cdc = (xml.match(/Id="(\d{44})"/) || [])[1];
  // el certificado se escribe un instante en un archivo temporal (lo exige el firmador) y se borra enseguida
  const ruta = await Deno.makeTempFile({ suffix: ".p12" });
  let firmado; try { await Deno.writeFile(ruta, Uint8Array.from(atob(Deno.env.get("SIFEN_P12_B64").replace(/\s+/g, "")), (c) => c.charCodeAt(0))); firmado = await xmlsign.signXML(xml, ruta, Deno.env.get("SIFEN_P12_PASS"), true); } finally { try { await Deno.remove(ruta); } catch (_) { } }
  const final = await conQR(firmado, String(idCSC).trim().padStart(4, "0"), String(CSC).trim(), ambiente); // el IdCSC va con 4 dígitos (1 → 0001)
  const sobre = envelope('<rEnviDe xmlns="http://ekuatia.set.gov.py/sifen/xsd"><dId>' + Date.now() + "</dId><xDE>" + final.replace(/^<\?xml[^>]*\?>\s*/, "") + "</xDE></rEnviDe>");
  const r = await soap(HOSTS[ambiente], "/de/ws/sync/recibe.wsdl", sobre, cert);
  const redirige = r.status >= 300 && r.status < 400;
  const estadoDNIT = tag(r.body, "dEstRes"), protocolo = tag(r.body, "dProtAut"), res = resultados(r.body);
  const estado = redirige ? "sin_conexion" : /aprobado/i.test(estadoDNIT) ? "aprobado" : /rechaz/i.test(estadoDNIT) ? "rechazado" : "desconocido";
  const registro = { estado, no: numeroTxt, numero, cdc, protocolo, ambiente, fecha: new Date().toISOString().slice(0, 19), codigo: (res[0] || {}).codigo || "", mensaje: (res[0] || {}).mensaje || (redirige ? "La DNIT no autenticó la conexión (redirige a " + r.location + ")" : "") };
  await escribir("fe_docs", cdc, { ventaId, ambiente, estado, xml: final, respuesta: r.body.slice(0, 4000) });
  if (estado === "aprobado" || estado === "rechazado") {
    const v2 = { ...venta, inv: ambiente === "prod" ? { ...(venta.inv || {}), type: estado === "aprobado" ? "electronica" : (venta.inv || {}).type || "", no: estado === "aprobado" ? numeroTxt : (venta.inv || {}).no || "", cdc: estado === "aprobado" ? cdc : (venta.inv || {}).cdc || "", estado, protocolo, mensaje: registro.mensaje }
      : { ...(venta.inv || {}), test: { ...registro } } };
    await escribir("sales", ventaId, v2);
  }
  return { ok: true, estado, numero: numeroTxt, cdc, protocolo, ambiente, codigo: registro.codigo, mensaje: registro.mensaje, resultados: res, advertencia, http: r.status };
}

/* Control: ¿esta función ENVÍA el certificado de cliente? client.badssl.com es un servidor público de pruebas que exige certificado y
   contesta distinto si no recibió ninguno o si recibió uno que no reconoce. No tiene relación con la DNIT. */
async function diagnosticoCliente() {
  const cert = abrirCertificado();
  const texto = (b) => b.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
  const pruebas = [];
  for (const [nombre, c] of [["Con mi certificado", cert], ["Sin certificado", null]]) {
    try { const r = await soap("client.badssl.com", "/", "", c, "GET"); pruebas.push({ prueba: nombre, http: r.status, texto: texto(r.body) }); }
    catch (e) { pruebas.push({ prueba: nombre, error: String((e && e.message) || e) }); }
  }
  return { servidor: "client.badssl.com", pruebas };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method === "GET") return json({ ok: true, funcion: "sifen", tiene_certificado: !!Deno.env.get("SIFEN_P12_B64"), tiene_clave_certificado: Deno.env.get("SIFEN_P12_PASS") !== undefined, tiene_clave_de_servicio: !!serviceKey() });
  try {
    await requireUser(req);
    const body = await req.json().catch(() => ({}));
    if (body.action === "diagnostico") return json({ ok: true, certificado: infoCertificado(abrirCertificado().cert) });
    if (body.action === "emitir") return json(await emitir(body));
    if (body.action === "diagnosticoCliente") return json({ ok: true, ...(await diagnosticoCliente()) });
    if (body.action === "diagnostico302") return json({ ok: true, ...(await diagnostico302(body)) });
    if (body.action === "consultaRuc") return json({ ok: true, ...(await consultaRuc(body)) });
    return json({ error: "Acción desconocida" }, 400);
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, (e && e.status) || 500);
  }
});
