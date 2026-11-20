// @ts-nocheck
// CristalAuto · sifen (Supabase Edge Function, nombre exacto: sifen)
// Conexión con SIFEN (DNIT).
//   action "diagnostico"        → lee el certificado de los Secrets y muestra de quién es y hasta cuándo vale
//   action "diagnostico302"     → compara pedidos a la DNIT con y sin certificado
//   action "diagnosticoSifen"   → diagnóstico por etapas en PRUEBAS: WSDL, TLS, control de certificado de cliente, consulta de RUC
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

/* Certificados PUBLICOS de la entidad certificadora (no son secretos): CODE100 S.A. (intermedia) y AC Raíz del Paraguay (raíz).
   Descargados del sitio de CODE100; la intermedia coincide con el identificador de emisor del certificado de la empresa. */
const CA_INTERMEDIA_PEM = `-----BEGIN CERTIFICATE-----
MIIHhDCCBWygAwIBAgIQCq+0ar5nFexj0FNZVzUbmTANBgkqhkiG9w0BAQsFADBv
MQswCQYDVQQGEwJQWTErMCkGA1UECgwiTWluaXN0ZXJpbyBkZSBJbmR1c3RyaWEg
eSBDb21lcmNpbzEzMDEGA1UEAwwqQXV0b3JpZGFkIENlcnRpZmljYWRvcmEgUmHD
rXogZGVsIFBhcmFndWF5MB4XDTIzMDEyNDIxNTMyOVoXDTMyMDEyNDIxNTMyOVow
gYUxCzAJBgNVBAYTAlBZMQ0wCwYDVQQKEwRJQ1BQMTgwNgYDVQQLEy9QcmVzdGFk
b3IgQ3VhbGlmaWNhZG8gZGUgU2VydmljaW9zIGRlIENvbmZpYW56YTEVMBMGA1UE
AxMMQ09ERTEwMCBTLkEuMRYwFAYDVQQFEw1SVUM4MDA4MDYxMC03MIICIjANBgkq
hkiG9w0BAQEFAAOCAg8AMIICCgKCAgEA5VwuLoNPkZN66NxKTeh6mvvmRwWr5D8a
ZeCNFOKmgaeIc0mE1uRNWxhlrsvYSDNusvyd21kDoC0VAbjJD5HTEnKepymBgjyM
6Pe+l9W0Vy9ugkuvEvVPp/QJtBB56bgdPtjJFLrOXDM55bM7ZUCaMEbryX/eAUJt
xm0LDJ2CRR1RMbwpvsWdwPaqMN848QQ5zn69BjA8/eBuOSMiEwlrt1z8uVyM8plh
GfAHsQB6oG+a216/TCVJTSudCSIJJL6YhG3vxRbasPXhdPaY0JCkUugoe0okFN7U
i7kjZE57LSEqN1dvDmv8ikAUn8vtDrvykIHbArs/2E7dYZ4X8rf0NHn5GOYo8e6m
IIUspyeH41ViFk1AxpF2zNuNOYiCCGBPinOOHjAdA2vkQJr1eOJGoOyg1giLzddO
CPyysBXjUSEqkVXaz6tSTkF3ifBMyg3ePgB3yqEbo5go/ZzcuPhfBsNoNcYRpY7F
EJ7MSdFHn+u45DHRRlyzJ8fdwyEufNXtOTvdJRawYuytw48RzIZXGUSQ8HT1JvFp
tROpHdVDLJ9zfSAwEIwTPgh3FdcAq1wB56sxF1SNn07UX6xUvD5Wk/VxUiULRQRc
GuDgp9FGLy927EvXTQk4SII6KBmVO+HNWzadYSSxxe5ocUzna30FMx/ewjtbyrxg
h9dRhWVjU10CAwEAAaOCAgMwggH/MBIGA1UdEwEB/wQIMAYBAf8CAQAwDgYDVR0P
AQH/BAQDAgEGMB0GA1UdDgQWBBS+NVRiaGDnJtMxwV+XseL2ZM4H9TAfBgNVHSME
GDAWgBTCxBHyKmhEDAAo7EzWKduS+1691jCBigYIKwYBBQUHAQEEfjB8MD8GCCsG
AQUFBzAChjNodHRwczovL3d3dy5hY3JhaXouZ292LnB5L2NydC9hY19yYWl6X3B5
X3NoYTI1Ni5jcnQwOQYIKwYBBQUHMAGGLWh0dHA6Ly9vY3NwLmNvZGUxMDAuY29t
LnB5L29jc3AvY2EtY29kZTEwMC1zYTCBzQYDVR0gBIHFMIHCMIG/BgNVHSAwgbcw
OQYIKwYBBQUHAgEWLWh0dHBzOi8vd3d3LmFjcmFpei5nb3YucHkvZHBjL0RPQy1J
Q1BQLTAxLnBkZjB6BggrBgEFBQcCAjBuGmxTdWpldG8gYSBsYXMgY29uZGljaW9u
ZXMgZGUgdXNvIGV4cHVlc3RhcyBlbiBsYSBEZWNsYXJhY2nzbiBkZSBQcuFjdGlj
YXMgZGUgQ2VydGlmaWNhY2nzbiBkZSBsYSBBQyBSYe16IC0gUHkwPAYDVR0fBDUw
MzAxoC+gLYYraHR0cDovL3d3dy5hY3JhaXouZ292LnB5L2FybC9hY19yYWl6X3B5
LmNybDANBgkqhkiG9w0BAQsFAAOCAgEAZ0O3BeY2y9IDnZiXMy+/Grb5oDw0YiDo
KkdoHdHDnd24yB2vf99Ei0FltBuwuXRHJkkoqAjWiIqUQy/Uw3rvySa8yCqOuTL2
uDqiX0v+waNIV2cY2BTLoPqRL5rv4WhqAbOlEY6YhLIA0cfBhnZpx9ufAL0cQiXN
927vuAJTEVu27Fr/gqDEIFNZPrEG2Ey6GEu3EK3L8AeQYKNjGHmuNJNFJn9YtRne
R4/dAX4bUvG6//GvAoKL1nqEcgcTtKN4uPdcdpTsuMpf34QAqgL0amhNPGdwgYso
fr55CEhQF2Q8mUgBj8oEFRrGrW4MokO0xlqjT+Vouyos3BONmrbfDI+uq3zF01o5
tg8NPzaD+zY50Lht4BKs7ulfhw7JhQA8lYhz8K3TpjjouR6npDAEMjVhQq2tnWTF
mNCEosrg0txyrSKi8K2COGuMzoA8K0D7IfnAvveYzwoWkyQv9N7p7M1PP8XEPdsq
PZ4qVnYXgRkUgwrmlweqNOzJ/nBpe1XuguS4JY2tFQP3JSsnk7dk1CmOwMRTxAUs
uJeA8MKvUbg9VhSuBOXUfc3KjbpVDTrgUymfyGe11bYSpal1dSqVYc+xQQxCYc1O
MFw32OFzH2XcbVt4KogxbZ3RbzPhUJm8HRfOafz3F0ac5jvmAGBldf1UajbY7muA
zdQw6EQn2fw=
-----END CERTIFICATE-----
`;
const CA_RAIZ_PEM = `-----BEGIN CERTIFICATE-----
MIIF+TCCA+GgAwIBAgIQDCG0OEbFG/VQINOr7TNcpTANBgkqhkiG9w0BAQsFADBv
MQswCQYDVQQGEwJQWTErMCkGA1UECgwiTWluaXN0ZXJpbyBkZSBJbmR1c3RyaWEg
eSBDb21lcmNpbzEzMDEGA1UEAwwqQXV0b3JpZGFkIENlcnRpZmljYWRvcmEgUmHD
rXogZGVsIFBhcmFndWF5MB4XDTEyMDgwNzA4MzY1OVoXDTMyMDgwNzA4MzY1OVow
bzELMAkGA1UEBhMCUFkxKzApBgNVBAoMIk1pbmlzdGVyaW8gZGUgSW5kdXN0cmlh
IHkgQ29tZXJjaW8xMzAxBgNVBAMMKkF1dG9yaWRhZCBDZXJ0aWZpY2Fkb3JhIFJh
w616IGRlbCBQYXJhZ3VheTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIB
AK6HfW/cm6CSmT+jjZqFSsUDVF/dhuVxBS93gNy7t8XCJBugnJ6t+HUiVeziPNNV
oVn9tOhVFxeJrOlfJxmvl9TTax0QbTwJUmw3AiPNNd1rdJL1gsQCKV0h4f+5djd/
ZbnOV8B9VYtXpU/E6csQHEkYodpkKUQswcftFPjcyhPDub8DoZfx1oBno0MJ0Rhq
DB6IxO5PHP5vbIggEDtezYneIyJsJyuC/KqeaJO30275dqN4rDZ8smOIOII/9L/z
3agbfkiuc9vKgXi9N7UXm0Vcb/tjvBiey9U7cahNA+W5x+mcwC2bnkGLMVVMCrW9
JbYvFCjyrg306IjoKQcVMoHcuxrYSME7ILqzglWgws26G45/khG2f9IpS6EDTqt5
uaKU9ogocmmUMtHfGqDRvp1yOKRs9jPuYcju6hJlkD9c8McKxkr9NMBR0q/SswzR
wNm8KhoPubjzCj0nYx6N2fnLBy6PhCpsmyf+z0LbT36voKNTSDKYYt03Ih2qL2uM
0PeaSim5bsw+kwDcIPTX1CS/OxIBgLUHlxAs28VIVKA/OE/m9eHcn6N3lYOt3vEW
kHr/wJqhk2JPw0G5apqj4nM74qX4YIONx/lGQSf47elkliPsGftfp4KsHB+9o1bN
rRCTfk6EpELx23RPwArCiA1dyjQofa4YW9yqGraAHp5bAgMBAAGjgZAwgY0wDwYD
VR0TAQH/BAUwAwEB/zAOBgNVHQ8BAf8EBAMCAQYwSwYDVR0gBEQwQjBABgRVHSAA
MDgwNgYIKwYBBQUHAgEWKmh0dHA6Ly93d3cuYWNyYWl6Lmdvdi5weS9jcHMvcG9s
aXRpY2FzLnBkZjAdBgNVHQ4EFgQUwsQR8ipoRAwAKOxM1inbkvtevdYwDQYJKoZI
hvcNAQELBQADggIBAJFz7SmvWakrRTF2RukHs5OMUMDEOyLq2U6qdmmI7G4RPfpw
BFVvnCgHs9o6R4aNNUk6i6itTNNwnsaExxiYtAUdx1wwQudv62doKEuBKGAplfjw
YuPN1zCEImEhSi2/e9OvgiJE3Hin++Gd2+j0gzIrKZ1xEO7KdvRPrOj9D7xl63oK
+VFX6d/FvUISJdPvsRjsvwbEm71FYe7Y5bDRLV1Zsti4pSOJMGl1ZgkCKgLEBfTQ
pnGuOzRlD30ddt4aCQnj/nSSJBsKHJ5MDed5f09ufzS5g6gRudIeoa6kV0vA2KI+
28Fafz1F/TRuE451nhb3M2vRBmcFj/nEZYt7adecYY98gXefxmwosPwOeKZq2EjG
L7/Si3l2sOiOazOprbV4XJfeVajBZY7o39U5SoPSMNqrPVeZfELwRqgX/LCUPqFE
ePTYrHaOdu3A7AoJb7q1rj9SEtB10hfIsg+BKF7ukFcqkoeys9ug5X16A1//LmaN
uku471ePVUzKw30WGTawFzOgxc1CsKqyVHxeGfmRdoqDwGl37S16NJSSPU9rloIe
77LqiQR7NZfFW/9cWnsPLHS3pCWJEYNbc4UL8pIOOBKt1edM6wK+Wkd8J+/1EBu+
LFCdjEgW07kZqe300S6TQYFxgD6KOCSM6ou33kR4rVF20lSWwwhDSf/DLn8e
-----END CERTIFICATE-----
`;

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
  // Si el archivo no trae la entidad certificadora, se agrega la intermedia pública (más la raíz sólo para verificar)
  const inter = forge.pki.certificateFromPem(CA_INTERMEDIA_PEM), raiz = forge.pki.certificateFromPem(CA_RAIZ_PEM);
  const hash = (c) => forge.md.sha1.create().update(forge.asn1.toDer(forge.pki.certificateToAsn1(c)).getBytes()).digest().toHex();
  if (!cadena.some((c) => hash(c) === hash(inter))) cadena.push(inter);
  // Verificación de la cadena: propio -> intermedia -> raíz (no se envía la raíz: el servidor ya la tiene)
  let cadenaOk = false, cadenaError = "";
  try {
    const store = forge.pki.createCaStore([raiz]);
    cadenaOk = forge.pki.verifyCertificateChain(store, [cert, inter]) === true;
  } catch (e) { cadenaError = e && e.message ? e.message : String(e); }
  const enviados = [cert, ...cadena.filter((c) => hash(c) !== hash(raiz))];
  return { keyPem: forge.pki.privateKeyToPem(key), certPem: enviados.map((c) => forge.pki.certificateToPem(c)).join(""), cert, cantidad: certs.length, enviados: enviados.length, cadenaOk, cadenaError, coincideConClave: certs.some(mismoModulo) };
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
    const opts = { host, port: 443, path, method: metodo, minVersion: "TLSv1.2", timeout: 10000, headers: { "User-Agent": "CristalAuto" } };
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
  return { ambiente: env, url: "https://" + host + ruta, certificados_en_archivo: cert.cantidad, certificados_enviados_a_la_DNIT: cert.enviados, cadena_verificada_hasta_la_raiz: cert.cadenaOk, cadena_error: cert.cadenaError, clave_coincide_con_certificado: cert.coincideConClave, pruebas };
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

/* Control: ¿el motor de esta función ENVÍA certificados de cliente? Se usa un certificado DESCARTABLE (generado solo para esto, sin relación con
   ninguna persona ni empresa) contra client.badssl.com, un servidor público que contesta distinto si no recibe certificado o si recibe uno que no
   reconoce. El certificado real de la empresa NUNCA se usa en este control ni sale de la función. */
const DESCARTABLE = {
  certPem: `-----BEGIN CERTIFICATE-----
MIIDITCCAgmgAwIBAgIUEhblR0vWe9mKO1J7/CegR1wVES4wDQYJKoZIhvcNAQEL
BQAwIDEeMBwGA1UEAwwVREVTQ0FSVEFCTEUtU0lOLVZBTE9SMB4XDTI2MTEyMDE1
MjEwMFoXDTM2MTExNzE1MjEwMFowIDEeMBwGA1UEAwwVREVTQ0FSVEFCTEUtU0lO
LVZBTE9SMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAs01USF73KZ3C
SZmZy2nrkANWvCuNTnZzeJ04v3YnQkHXFmwCsVGRMTsB6px610P9ABSnisyUVqJm
2L+ybZmhbWNtpV8Z0IVAkv91vJwDDM1zmDzwRUEjxsi019WkLVPowcBrzkpNTcZ3
Pd/lLdi0FLfJrzHT/sFodmU46vQImo7/+Zh8EqmjIS2wcvG5WLnpjIvgHcFHnzMn
tO0P4LM1sM5GqfTywXfBJFjPF71whuVpSDsL+vjBiyU1hzBgANvXF4QyWbldnrjH
uNnhQ6ZotSPPLPfMjWARxpvMbserPa05DcKFKlgXRYMFi83pwiGMOnIPTc1NaGUE
Z7b9/rTERQIDAQABo1MwUTAdBgNVHQ4EFgQUa2eLvMuqnwCF5hFI0+KliwsaGaQw
HwYDVR0jBBgwFoAUa2eLvMuqnwCF5hFI0+KliwsaGaQwDwYDVR0TAQH/BAUwAwEB
/zANBgkqhkiG9w0BAQsFAAOCAQEAKDCr5JhBWox9oE+NJY8ojAjyJmr4MEi6xSJr
BpPUBlzs/rC2+U7jROkc4nOMLvEw68SrvkHgp1olC/udk35l+KGgWWH7j/MUpGY5
KZc1CWQ1XnIOKKlvdR+HZgzGUN44H4BGPqf/lnHfKzwUCuG356qW6rcmuvBjfo2L
Sa131l/TvLzDAHahMKne5tmxhV3U5Xw2S8o5UmOOsUJVCpoGNzxkJ4mxD/jkXWk/
GN8x8TD9Y/tCI8IeXaYBApO9vCudUCiCWm5aOYZPNJFUguYOtYyAlV6z8meGreGV
g+Nj0vNnnfz+vwi4+/31pxyqqjTra3M/bOM1DVNU2WZw5Ahc3w==
-----END CERTIFICATE-----`,
  keyPem: `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCzTVRIXvcpncJJ
mZnLaeuQA1a8K41OdnN4nTi/didCQdcWbAKxUZExOwHqnHrXQ/0AFKeKzJRWombY
v7JtmaFtY22lXxnQhUCS/3W8nAMMzXOYPPBFQSPGyLTX1aQtU+jBwGvOSk1Nxnc9
3+Ut2LQUt8mvMdP+wWh2ZTjq9Aiajv/5mHwSqaMhLbBy8blYuemMi+AdwUefMye0
7Q/gszWwzkap9PLBd8EkWM8XvXCG5WlIOwv6+MGLJTWHMGAA29cXhDJZuV2euMe4
2eFDpmi1I88s98yNYBHGm8xux6s9rTkNwoUqWBdFgwWLzenCIYw6cg9NzU1oZQRn
tv3+tMRFAgMBAAECggEAGmWExjfG4udRClVU5TO1hIjdTMwLnFTHaKcayuMZ4gD/
6ZLirZiwy6LghBnf4s+lUEz6Im6+WufDRN8p5UVEFO7Znko7Km3npQx7WJZOQ6T+
gtfb1pJBslrrdsgCyNKM1nNd26uoKE5S0TbkTkTUNCWfiU2IZH20Q5Pg1oQxPRGX
w4mZmcZai/mG5tkP6ROMcULm4gq1kNihk0qdAWnsm+qQZ4StikFAikyXHo5HkS55
mipn2exE3bxb4w+avUoo++4DEXdttWRhf2muek3bMttJ88gWsUkXo/cDbpb7nLjz
vv2Pk3C5tLH7tfyuHk9hin0XIbvDFIEyctlh8cXbYQKBgQDdTEg0hQlD6Sm1o8Ph
6BIBUW9UBC2PYNg1pzaOamHCx/mb3dZxBa0+wYqXeoXKQAp1wEpQ6iQqCcDiKGT0
jBotiat1bUOjyk6FnJ3zPgSy4ZVVtC/R+jR0CynmWTfWRifvD+Atfs9AhnsJ1a1N
AE6v9qG2HNGMVUXD1lrlKcz6YQKBgQDPay0h6ZQvQ7Aw2QK31B35JqN40X1+xV1h
zPd1P9+pAHsHdnX45y9mqfbjadabeNzhdUYiZcslGa40VBT+yq4+9fTxZNQMExI0
KMQuZGZZOeOjYswXl6dQ/xFOlu1gWPgbKylnTgXtH15da89746WjagL/TsvhOdp1
j2uw1+98ZQKBgQCrSS3iKM7BF6nHA9jL9DprdsK6vvkcrxLqhGB/3uuIPgx/jjc7
B+/OUTOah6UipGr0NT/QXUpcl2wKIMXzWrWwZYymuUnPbvlUBaNj8K7mXiCeU3do
CUesQi/OMWQ8n9Ss/xa/YBW+ldiKBi+7F+/P1w/Xy3qOKjpzmGiGU9JqQQKBgBUT
O8O9WwwuYYGlGyyYhe8h6OxGxOyTmzhrvh0Qv2YJoXaRp80BmIRi8q4Ku/6SGkdi
Rh0KoMiFQnkYrgVxjKDjFt9MMmuDqI7aMYzRMMESK7oXOMuQ4jRNpnGIzlfC0nrY
ON3BRMLiNBFj+fIJoHPpOqK8W+TnnvXg+709Q50tAoGAHzCL21PdB2a1DsNo4fez
WwWE8pdFlWb8tik18lxcct44R912PUBY9Uyg/4cdd49n8UyTYxNai1hT/670oxEo
cE1rhipmgcM0YbV86x15F06+qmtY9iovnYuNM2327lNPbCfr40Lvk9AfUxyNLoCx
kd8oIA3aREnkLR2mYpJJ2Gs=
-----END PRIVATE KEY-----`,
};
async function diagnosticoCliente() {
  const texto = (b) => b.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
  const pruebas = await Promise.all([["Con un certificado descartable", DESCARTABLE], ["Sin certificado", null]].map(async ([nombre, c]) => {
    try { const r = await soap("client.badssl.com", "/", "", c, "GET"); return { prueba: nombre, http: r.status, texto: texto(r.body) }; }
    catch (e) { return { prueba: nombre, error: String((e && e.message) || e) }; }
  }));
  return { servidor: "client.badssl.com", nota: "Se usó un certificado descartable; el certificado de la empresa no se envió.", pruebas };
}

/* ================= DIAGNÓSTICO POR ETAPAS (solo lee y consulta; no emite facturas) ================= */
/* Conexión de bajo nivel que además informa el protocolo TLS negociado y el certificado del servidor */
function sondeo(host, path, metodo, body, cert, extra = {}) {
  return new Promise((resolve, reject) => {
    const opts = { host, port: 443, path, method: metodo, minVersion: "TLSv1.2", timeout: 8000, agent: false, headers: { "User-Agent": "CristalAuto" }, ...extra };
    if (cert) { opts.key = cert.keyPem; opts.cert = cert.certPem; }
    if (body) { opts.headers["Content-Type"] = extra.contentType || "application/soap+xml; charset=utf-8"; opts.headers["Content-Length"] = Buffer.byteLength(body); }
    delete opts.contentType;
    const req = https.request(opts, (res) => {
      let data = ""; res.setEncoding("utf8"); res.on("data", (c) => { if (data.length < 200000) data += c; });
      res.on("end", () => {
        const s = res.socket; let srv = null;
        try { const c = s.getPeerCertificate(true); if (c && c.subject) { srv = { titular: (c.subject.CN || ""), emisor: (c.issuer && c.issuer.CN) || "", valido_hasta: c.valid_to || "", cadena: [] }; for (let x = c, i = 0; x && i < 6; i++) { srv.cadena.push(((x.subject && x.subject.CN) || "?")); if (!x.issuerCertificate || x.issuerCertificate === x) break; x = x.issuerCertificate; } } } catch (_) {}
        let proto = "", cifrado = ""; try { proto = s.getProtocol() || ""; cifrado = (s.getCipher() || {}).name || ""; } catch (_) {}
        resolve({ status: res.statusCode, location: res.headers.location || "", servidor: res.headers.server || "", contentType: res.headers["content-type"] || "", protocolo: proto, cifrado, servidorCert: srv, body: data });
      });
    });
    req.on("timeout", () => req.destroy(new Error("La DNIT no respondió en 8 segundos (conexión cortada o sin respuesta)")));
    req.on("error", reject); if (body) req.write(body); req.end();
  });
}
const tipoCuerpo = (b) => (b.includes("Envelope")) ? "SOAP/XML" : (b.includes("definitions") || b.includes("wsdl:")) ? "WSDL" : b.toLowerCase().includes("<html") ? "página HTML" : b ? "otro" : "vacío";
const texto = (b) => b.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
const msg = (e) => String((e && e.message) || e);

const SERVICIOS = [
  ["recibe (síncrono)", "/de/ws/sync/recibe.wsdl"], ["recibe-lote", "/de/ws/async/recibe-lote.wsdl"], ["eventos", "/de/ws/eventos/evento.wsdl"],
  ["consulta (CDC)", "/de/ws/consultas/consulta.wsdl"], ["consulta-lote", "/de/ws/consultas/consulta-lote.wsdl"], ["consulta-ruc", "/de/ws/consultas/consulta-ruc.wsdl"],
];

async function diagnosticoSifen(body) {
  const env = body.ambiente === "prod" ? "prod" : "test";
  if (env === "prod") throw Object.assign(new Error("El diagnóstico se hace solo en el ambiente de PRUEBAS"), { status: 400 });
  const host = HOSTS.test, cert = abrirCertificado();
  const R = { ambiente: "test", host, certificado: { enviados: cert.enviados, cadena_verificada_hasta_la_raiz: cert.cadenaOk, cadena_error: cert.cadenaError, clave_coincide: cert.coincideConClave }, etapas: {} };

  // Etapa 1 — WSDL (lectura, sin enviar datos): con y sin certificado, sin seguir redirecciones
  const direcciones = {};
  const wsdl = await Promise.all(SERVICIOS.map(async ([nombre, ruta]) => {
    const fila = { servicio: nombre, url: "https://" + host + ruta + "?wsdl" };
    await Promise.all([["con_certificado", cert], ["sin_certificado", null]].map(async ([k, c]) => {
      try {
        const r = await sondeo(host, ruta + "?wsdl", "GET", "", c);
        fila[k] = { http: r.status, location: r.location, tipo: tipoCuerpo(r.body), content_type: r.contentType, servidor: r.servidor };
        const m = r.body.match(/<(?:\w+:)?address[^>]*location="([^"]+)"/);
        if (m) { fila[k].soap_address = m[1]; if (k === "con_certificado") direcciones[ruta] = m[1]; }
      } catch (e) { fila[k] = { error: msg(e) }; }
    }));
    return fila;
  }));
  R.etapas["1_wsdl"] = wsdl;

  // Etapa 2 — TLS: protocolo negociado por defecto y forzando TLS 1.2, cadena del servidor
  const tls = await Promise.all([["TLS por defecto (mínimo 1.2)", {}], ["TLS 1.2 forzado", { maxVersion: "TLSv1.2" }]].map(async ([nombre, extra]) => {
    try { const r = await sondeo(host, "/de/ws/consultas/consulta-ruc.wsdl?wsdl", "GET", "", null, extra); return { prueba: nombre, protocolo: r.protocolo, cifrado: r.cifrado, certificado_servidor: r.servidorCert, http: r.status }; }
    catch (e) { return { prueba: nombre, error: msg(e) }; }
  }));
  R.etapas["2_tls"] = tls;

  // Etapa 3 — Control de autenticación mutua con un certificado DESCARTABLE (el de la empresa no sale)
  try { R.etapas["3_control_mtls"] = await diagnosticoCliente(); } catch (e) { R.etapas["3_control_mtls"] = { error: msg(e) }; }

  // Etapa 4 — Consulta de RUC SOAP 1.2 con certificado, forzando TLS 1.2; en la dirección que declara el WSDL (si la hay)
  const ruta = "/de/ws/consultas/consulta-ruc.wsdl", declarada = direcciones[ruta];
  const destinos = [{ nombre: "ruta oficial sin ?wsdl", host, ruta }];
  if (declarada) { try { const u = new URL(declarada); destinos.push({ nombre: "dirección del WSDL (soap:address)", host: u.host, ruta: u.pathname }); } catch (_) {} }
  const ruc = String(body.ruc || "80139512").replace(/\D/g, "").slice(0, 12);
  const xml = envelope(`<rEnviConsRUC xmlns="http://ekuatia.set.gov.py/sifen/xsd"><dId>1</dId><dRUCCons>${ruc}</dRUCCons></rEnviConsRUC>`);
  const combos = [];
  for (const d of destinos) for (const [tipo, ct] of [["SOAP 1.2 (application/soap+xml)", "application/soap+xml; charset=utf-8"], ["application/xml", "application/xml; charset=utf-8"]]) combos.push([d, tipo, ct]);
  const soapPruebas = await Promise.all(combos.map(async ([d, tipo, ct]) => {
    try { const r = await sondeo(d.host, d.ruta, "POST", xml, cert, { maxVersion: "TLSv1.2", contentType: ct }); return { destino: d.nombre, url: "https://" + d.host + d.ruta, content_type_enviado: tipo, protocolo: r.protocolo, http: r.status, location: r.location, tipo: tipoCuerpo(r.body), codigo: tag(r.body, "dCodRes"), mensaje: tag(r.body, "dMsgRes"), razonSocial: tag(r.body, "dRazCons"), inicio: texto(r.body) }; }
    catch (e) { return { destino: d.nombre, content_type_enviado: tipo, error: msg(e) }; }
  }));
  R.etapas["4_consulta_ruc"] = soapPruebas;

  // Veredicto en palabras simples
  const redir = (x) => x && x.http >= 300 && x.http < 400;
  const w = wsdl.map((f) => f.con_certificado).filter(Boolean);
  const v = [];
  v.push(w.every(redir) ? "Los 6 WSDL responden con redirección (302) incluso al leer: el portal no deja pasar esta conexión." : w.some((x) => x.tipo === "WSDL") ? "Al menos un WSDL se pudo leer: la conexión llega al servicio." : "Los WSDL no devolvieron un WSDL; revisar etapa 1.");
  const c3 = (R.etapas["3_control_mtls"].pruebas || []);
  if (c3.length === 2) v.push(c3[0].http === 200 && c3[1].http !== 200 ? "Control: esta función SÍ envía certificados de cliente (el problema no es del motor de Supabase)." : "Control: la función NO logró enviar certificado de cliente (conviene un servidor independiente para SIFEN).");
  const ok4 = soapPruebas.find((x) => x.tipo === "SOAP/XML");
  v.push(ok4 ? "La consulta de RUC obtuvo respuesta SOAP: " + (ok4.codigo || "") + " " + (ok4.mensaje || "") : "La consulta de RUC no obtuvo respuesta SOAP.");
  R.veredicto = v;
  return R;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method === "GET") return json({ ok: true, funcion: "sifen", tiene_certificado: !!Deno.env.get("SIFEN_P12_B64"), tiene_clave_certificado: Deno.env.get("SIFEN_P12_PASS") !== undefined, tiene_clave_de_servicio: !!serviceKey() });
  try {
    await requireUser(req);
    const body = await req.json().catch(() => ({}));
    if (body.action === "diagnostico") return (() => { const c = abrirCertificado(); return json({ ok: true, certificado: infoCertificado(c.cert), certificados_enviados: c.enviados, cadena_verificada_hasta_la_raiz: c.cadenaOk, cadena_error: c.cadenaError }); })();
    if (body.action === "emitir") return json(await emitir(body));
    if (body.action === "diagnosticoSifen") return json({ ok: true, ...(await diagnosticoSifen(body)) });
    if (body.action === "diagnosticoCliente") return json({ ok: true, ...(await diagnosticoCliente()) });
    if (body.action === "diagnostico302") return json({ ok: true, ...(await diagnostico302(body)) });
    if (body.action === "consultaRuc") return json({ ok: true, ...(await consultaRuc(body)) });
    return json({ error: "Acción desconocida" }, 400);
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, (e && e.status) || 500);
  }
});
