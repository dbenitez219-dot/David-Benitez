// CristalAuto · factura electrónica directa a la DNIT (SIFEN)
// Corre en Netlify Functions. La app la llama con el token de la sesión de Supabase.
// - action "estado":   qué falta configurar y si el certificado abre bien
// - action "ruc":      busca nombre / razón social de un RUC en la DNIT
// - action "emitir":   arma el XML de la factura, lo firma, lo envía y devuelve CDC + QR
// - action "cancelar": anula una factura ya aprobada (evento de cancelación)
// Configuración (Netlify → Site configuration → Environment variables):
//   SIFEN_AMBIENTE      "test" (pruebas) o "prod" (facturas reales)
//   SIFEN_CERT_B64      el archivo .p12 del certificado, en base64
//   SIFEN_CERT_CLAVE    la contraseña del certificado
//   SIFEN_TIMBRADO      número de timbrado (en pruebas: el RUC sin dígito, 80139512)
//   SIFEN_TIMBRADO_DESDE  fecha de inicio del timbrado, aaaa-mm-dd
//   SIFEN_CSC_ID, SIFEN_CSC   id y clave del CSC (en pruebas: 1 y ABCD0000000000000000000000000000)
//   SIFEN_ACTIVIDAD     código y descripción de la actividad económica, "45200:Mantenimiento y reparación de vehículos"
//   opcionales: SIFEN_ESTABLECIMIENTO (001), SIFEN_PUNTO (001), SIFEN_EMAIL
const fs = require("fs");
const os = require("os");
const path = require("path");
const xmlgen = require("facturacionelectronicapy-xmlgen").default;
const xmlsign = require("facturacionelectronicapy-xmlsign").default;
const setapi = require("facturacionelectronicapy-setapi").default;
const qrgen = require("facturacionelectronicapy-qrgen").default;
const QRCode = require("qrcode");

const SB_URL = "https://nmvlnyxgfhveleeewklg.supabase.co";
const SB_KEY = "sb_publishable_malo3Q2XwfqBH1GCGOc9uw_XIWStLQa";
const TEST_RAZON = "DE generado en ambiente de prueba - sin valor comercial ni fiscal";

// <<PURE-START>> (lógica sin dependencias externas: se prueba por separado)
const TZ = "America/Asuncion";
function ahoraPY(d) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(d || new Date());
  const g = (t) => p.find((x) => x.type === t).value;
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}:${g("second")}`;
}
const solo = (s) => String(s == null ? "" : s).trim();
// "80139512-7" → contribuyente; "5246621" → cédula; vacío → consumidor final sin nombre
function receptor(c) {
  const doc = solo(c.ruc).replace(/\./g, "").replace(/\s/g, "");
  const nombre = solo(c.nombre) || "Sin Nombre";
  const base = { razonSocial: nombre, pais: "PRY", paisDescripcion: "Paraguay", email: solo(c.email) || undefined, celular: solo(c.telefono) || undefined };
  const m = doc.match(/^(\d{3,8})-(\d)$/);
  if (m) return { ...base, contribuyente: true, ruc: `${m[1]}-${m[2]}`, tipoContribuyente: Number(m[1]) >= 80000000 ? 2 : 1, tipoOperacion: 1 };
  if (/^\d{3,15}$/.test(doc)) return { ...base, contribuyente: false, tipoOperacion: 2, documentoTipo: 1, documentoNumero: doc };
  return { ...base, contribuyente: false, tipoOperacion: 2, documentoTipo: 5, documentoNumero: "0", razonSocial: nombre === "Sin Nombre" ? "Sin Nombre" : nombre };
}
// Precios con IVA 10% incluido. Si el total de la venta es menor a la suma (descuento o total a mano),
// la diferencia se reparte como descuento por ítem para que la factura dé el mismo total.
function itemsFactura(venta) {
  const items = (venta.items || []).filter((i) => i.qty > 0 && i.unit > 0);
  const bruto = items.reduce((a, i) => a + i.qty * i.unit, 0);
  const desc = Math.max(0, Math.round(bruto - (venta.total > 0 ? venta.total : bruto)));
  let resto = desc;
  return items.map((i, k) => {
    const linea = i.qty * i.unit;
    const d = Math.min(linea, k === items.length - 1 ? resto : Math.round((desc * linea) / bruto));
    resto -= d;
    return { codigo: solo(i.code) || String(k + 1), descripcion: solo(i.name).slice(0, 120) || "Servicio", unidadMedida: 77, cantidad: i.qty, precioUnitario: i.unit,
      descuento: Math.round(d / i.qty), ivaTipo: 1, ivaProporcion: 100, iva: 10 };
  });
}
// 1 venta de mercadería, 2 prestación de servicios, 3 mixto
function tipoTransaccion(venta) {
  const t = new Set((venta.items || []).map((i) => (i.type === "srv" ? "s" : "m")));
  return t.size > 1 ? 3 : t.has("s") ? 2 : 1;
}
// Forma de pago para SIFEN: 1 efectivo, 2 cheque, 3 tarjeta crédito, 5 transferencia
const TIPO_PAGO = { Efectivo: 1, Cheque: 2, Transferencia: 5, "Itaú": 5 };
function condicion(venta, total) {
  if (venta.pay === "credito") {
    const dias = venta.due && venta.date ? Math.max(1, Math.round((new Date(venta.due) - new Date(venta.date)) / 864e5)) : 30;
    return { tipo: 2, credito: { tipo: 1, plazo: `${dias} días` } };
  }
  const m = (venta.pays || []).map((p) => p.method).find((x) => TIPO_PAGO[x]) || "Efectivo";
  return { tipo: 1, entregas: [{ tipo: TIPO_PAGO[m], monto: String(Math.round(total)), moneda: "PYG", cambio: 0 }] };
}
const numero7 = (n) => String(Math.max(1, Math.floor(Number(n) || 1))).padStart(7, "0");
// <<PURE-END>>

function cfg() {
  const e = process.env;
  return {
    ambiente: e.SIFEN_AMBIENTE === "prod" ? "prod" : "test",
    certB64: e.SIFEN_CERT_B64 || "", certClave: e.SIFEN_CERT_CLAVE || "",
    timbrado: e.SIFEN_TIMBRADO || "", timbradoDesde: e.SIFEN_TIMBRADO_DESDE || "",
    cscId: e.SIFEN_CSC_ID || "", csc: e.SIFEN_CSC || "",
    actividad: e.SIFEN_ACTIVIDAD || "",
    est: e.SIFEN_ESTABLECIMIENTO || "001", punto: e.SIFEN_PUNTO || "001", email: e.SIFEN_EMAIL || "",
  };
}
function faltantes(c) {
  const f = [];
  if (!c.certB64) f.push("SIFEN_CERT_B64 (certificado)");
  if (!c.certClave) f.push("SIFEN_CERT_CLAVE (contraseña del certificado)");
  if (!c.timbrado) f.push("SIFEN_TIMBRADO");
  if (!c.timbradoDesde) f.push("SIFEN_TIMBRADO_DESDE");
  if (!c.cscId || !c.csc) f.push("SIFEN_CSC_ID y SIFEN_CSC");
  if (!/^\d+:.+/.test(c.actividad)) f.push("SIFEN_ACTIVIDAD (código:descripción)");
  return f;
}
// El certificado vive en una variable; las librerías lo leen de un archivo temporal
function certFile(c) {
  const f = path.join(os.tmpdir(), "sifen-cert.p12");
  if (!fs.existsSync(f)) fs.writeFileSync(f, Buffer.from(c.certB64, "base64"));
  return f;
}
function params(c) {
  const [cod, ...desc] = c.actividad.split(":");
  return {
    version: 150, ruc: "80139512-7",
    razonSocial: c.ambiente === "test" ? TEST_RAZON : "CRISTALAUTO E.A.S. UNIPERSONAL",
    nombreFantasia: "CristalAuto Parabrisas",
    actividadesEconomicas: [{ codigo: cod.trim(), descripcion: desc.join(":").trim() }],
    timbradoNumero: c.timbrado, timbradoFecha: c.timbradoDesde,
    tipoContribuyente: 2,
    establecimientos: [{
      codigo: c.est, direccion: "NICANOR RIOS", numeroCasa: "480",
      complementoDireccion1: "A cuatro cuadras de la Avda. Pratt Gill",
      departamento: 12, departamentoDescripcion: "CENTRAL", distrito: 164, distritoDescripcion: "SAN LORENZO",
      ciudad: 6013, ciudadDescripcion: "BARCEQUILLO", telefono: "0984102671", email: c.email || undefined, denominacion: "CristalAuto Parabrisas",
    }],
  };
}
const id = () => Math.floor(Date.now() / 1000) % 1e9;
// Busca el primer valor de una etiqueta en la respuesta (las respuestas de SIFEN cambian de forma según el caso)
function buscar(obj, clave) {
  if (!obj || typeof obj !== "object") return undefined;
  for (const [k, v] of Object.entries(obj)) {
    if (k.replace(/^ns\d*:/, "") === clave) return Array.isArray(v) ? v[0] : v;
    const r = buscar(v, clave); if (r !== undefined) return r;
  }
}
function mensajes(r) {
  const out = [];
  (function walk(o) {
    if (!o || typeof o !== "object") return;
    for (const [k, v] of Object.entries(o)) {
      if (k.replace(/^ns\d*:/, "") === "gResProc") (Array.isArray(v) ? v : [v]).forEach((g) => out.push(`${buscar(g, "dCodRes") || ""} ${buscar(g, "dMsgRes") || ""}`.trim()));
      else walk(v);
    }
  })(r);
  return out;
}

async function usuario(token) {
  if (!token) return null;
  const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${token}` } });
  return r.ok ? r.json() : null;
}
const resp = (code, body) => ({ statusCode: code, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(body) });

async function emitir(c, b) {
  const venta = b.venta || {};
  const items = itemsFactura(venta);
  if (!items.length) return resp(400, { ok: false, error: "La venta no tiene ítems" });
  const total = items.reduce((a, i) => a + i.cantidad * (i.precioUnitario - i.descuento), 0);
  const data = {
    tipoDocumento: 1, establecimiento: c.est, punto: c.punto, numero: numero7(b.numero),
    codigoSeguridadAleatorio: String(Math.floor(1e8 + Math.random() * 9e8)),
    fecha: ahoraPY(), tipoEmision: 1, tipoTransaccion: tipoTransaccion(venta), tipoImpuesto: 1, moneda: "PYG",
    cliente: receptor(b.cliente || {}),
    factura: { presencia: 1 },
    condicion: condicion(venta, total),
    items,
  };
  if (venta.vehicle) data.observacion = `Vehículo: ${solo(venta.vehicle).slice(0, 100)}`;
  const file = certFile(c);
  const xml = (await xmlgen.generateXMLDE(params(c), data)).replace("<cTipReg/>", "");
  const firmado = await xmlsign.signXML(xml, file, c.certClave, true);
  const conQR = await qrgen.generateQR(firmado, c.cscId, c.csc, c.ambiente);
  const cdc = (conQR.match(/<DE Id="(\d{44})"/) || [])[1];
  const qrUrl = ((conQR.match(/<dCarQR>([^<]+)<\/dCarQR>/) || [])[1] || "").replace(/&amp;/g, "&");
  const r = await setapi.recibe(id(), conQR, c.ambiente, file, c.certClave);
  const estado = buscar(r, "dEstRes") || "";
  const aprobado = /^Aprobado/i.test(estado);
  return resp(200, {
    ok: aprobado, estado, mensajes: mensajes(r), cdc, ambiente: c.ambiente,
    numero: `${c.est}-${c.punto}-${data.numero}`, timbrado: c.timbrado, timbradoDesde: c.timbradoDesde, fecha: data.fecha, total,
    items: items.map((i) => ({ descripcion: i.descripcion, cantidad: i.cantidad, precioUnitario: i.precioUnitario, descuento: i.descuento })),
    qrUrl, qrPng: qrUrl ? await QRCode.toDataURL(qrUrl, { margin: 1, width: 300 }) : "",
    xml: aprobado ? conQR : undefined,
  });
}
async function cancelar(c, b) {
  if (!/^\d{44}$/.test(b.cdc || "")) return resp(400, { ok: false, error: "CDC inválido" });
  const file = certFile(c);
  const xml = await xmlgen.generateXMLEventoCancelacion(id(), params(c), { cdc: b.cdc, motivo: solo(b.motivo).slice(0, 500) || "Anulación de la venta" });
  const firmado = await xmlsign.signXMLEvento(xml, file, c.certClave, true);
  const r = await setapi.evento(id(), firmado, c.ambiente, file, c.certClave);
  const estado = buscar(r, "dEstRes") || "";
  return resp(200, { ok: /^Aprobado/i.test(estado), estado, mensajes: mensajes(r) });
}
async function consultaRUC(c, b) {
  const ruc = solo(b.ruc).replace(/-\d$/, "").replace(/\D/g, "");
  if (!ruc) return resp(400, { ok: false, error: "RUC vacío" });
  const r = await setapi.consultaRUC(id(), ruc, c.ambiente, certFile(c), c.certClave);
  const nombre = buscar(r, "dRazCons");
  return resp(200, { ok: !!nombre, nombre: nombre || "", estado: buscar(r, "dDesEstCons") || "", mensaje: buscar(r, "dMsgRes") || "" });
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return resp(405, { ok: false, error: "Usar POST" });
  const token = (event.headers.authorization || event.headers.Authorization || "").replace(/^Bearer\s+/i, "");
  if (!(await usuario(token))) return resp(401, { ok: false, error: "Iniciá sesión en la app" });
  let b; try { b = JSON.parse(event.body || "{}"); } catch { return resp(400, { ok: false, error: "Pedido inválido" }); }
  const c = cfg(), falta = faltantes(c);
  try {
    if (b.action === "estado") {
      let cert = null;
      if (c.certB64 && c.certClave) {
        try { const v = await xmlsign.getExpiration(certFile(c), c.certClave, true); cert = { vence: String(v.notAfter) }; }
        catch (e) { cert = { error: "No se pudo abrir el certificado: revisá el archivo y la contraseña" }; }
      }
      return resp(200, { ok: !falta.length && !(cert && cert.error), ambiente: c.ambiente, falta, cert, timbrado: c.timbrado, punto: `${c.est}-${c.punto}` });
    }
    if (falta.length) return resp(400, { ok: false, error: "Falta configurar: " + falta.join(", ") });
    if (b.action === "emitir") return await emitir(c, b);
    if (b.action === "cancelar") return await cancelar(c, b);
    if (b.action === "ruc") return await consultaRUC(c, b);
    return resp(400, { ok: false, error: "Acción desconocida" });
  } catch (e) {
    console.error(e);
    return resp(500, { ok: false, error: (e && e.message) || String(e) });
  }
};
