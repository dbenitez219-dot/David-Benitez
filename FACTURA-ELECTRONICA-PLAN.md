# Factura electrónica (SIFEN) dentro de CristalAuto · plan y notas

Estado: **investigación hecha, construcción no iniciada** (falta timbrado, certificado en Supabase y acceso a Marangatú).
Contribuyente: CRISTALAUTO E.A.S. UNIPERSONAL · RUC 80139512-7 · solicitud de habilitación **ACEPTADA** nº 364010082024 (ambiente TEST, CSC genéricos).

## Qué hay que construir
1. Armar el XML del Documento Electrónico (DE) desde una venta de la app (factura, tipo 1).
2. Firmarlo (XMLDSig) con el certificado PKCS#12 del contribuyente (comprado a una PSC).
3. Calcular CDC (44 dígitos con dígito verificador) y el QR (usa el CSC).
4. Enviarlo al web service de SIFEN (`siRecepDE` / lotes) con **TLS 1.2 con autenticación mutua** (el certificado cliente va en la conexión).
5. Guardar el resultado (aprobado/rechazado, CDC, número) en la venta y generar el KuDE (PDF con QR) para el cliente.
6. Eventos: cancelación e inutilización.

## Herramientas elegidas (open source, MIT, mantenidas)
`facturacionelectronicapy-xmlgen` (Manual Técnico **v150**, valida datos y calcula CDC), `-xmlsign`, `-qrgen`, `-setapi` (envío; `env = "test" | "prod"`, recibe ruta del certificado y clave), `-kude`.
Corren en Node. **Riesgo abierto:** que `setapi` (conexión con certificado cliente) funcione dentro de una Edge Function de Supabase (Deno). Plan B: mover solo esa pieza a otro servidor Node pequeño.

## Pruebas locales ya hechas (sin enviar nada a la DNIT)
- Armado del XML de una factura de ejemplo con la librería (Manual v150): **OK**, calcula el CDC de 44 dígitos.
- La librería valida los códigos geográficos. **San Lorenzo: departamento CENTRAL = 12** (11 es Alto Paraná), distrito **164**, ciudad **6040**.
- Firma XMLDSig (rsa-sha256) con un certificado de prueba autofirmado: **OK solo con el modo JavaScript** (`signXML(xml, p12, clave, true)`). El modo por defecto usa **Java** y **no sirve** en Supabase.
- **Pendiente de probar:** el envío. `setapi` usa `https.Agent` con el `.p12` (TLS con certificado cliente) contra `sifen-test.set.gov.py`. Primera prueba barata: una función que haga una **consulta de RUC** en TEST con el certificado real; si la conexión falla desde Supabase, pasar esa pieza a un servidor Node pequeño (plan B).

## Hallazgos de la verificación del 19/11/2026 (comprobados ejecutando código, sin enviar nada a la DNIT)
- Armado del XML con datos reales no secretos del emisor: OK. Totales e IVA 10% incluido correctos (1.300.000 → IVA 118.182).
- Firma XMLDSig (modo JavaScript) y **verificación posterior de la firma**: OK (el digest del bloque `<DE>` coincide).
- **ERROR de la librería `facturacionelectronicapy-qrgen`:** `generateQR()` vuelve a leer y a escribir todo el XML con xml2js (con sangrías), lo que **cambia el bloque `<DE>` e invalida la firma**. NO usar el XML que devuelve.
  **Solución comprobada:** usar la librería solo para obtener el valor del QR (`<dCarQR>`) e **insertarlo como texto** antes de `</rDE>` en el XML firmado original: `<gCamFuFD><dCarQR>…</dCarQR></gCamFuFD>`. Verificado: el `<DE>` queda idéntico, el digest coincide y la firma se valida.
- Tipos de régimen que acepta la librería: 1 Turismo, 2 Importador, 3 Exportador, 4 Maquila, 5 Ley 60/90, 6 Pequeño Productor, 7 Mediano Productor, 8 Régimen Contable. **Falta confirmar cuál figura en el RUC de la empresa** (se asumió 8 solo para las pruebas).
- La conexión desde Supabase llegó al servidor de pruebas de la DNIT: respondió **HTTP 302**. Pendiente: ver a dónde redirige y si el certificado (a nombre del representante, emitido por CODE100) trae el RUC de la empresa (la función nueva muestra los atributos del certificado y la redirección).
- Pendiente de comprobar en Deno (Supabase): que las librerías (xmlgen, xmlsign en modo JS, node-forge) y la conexión con certificado cliente funcionen; en Node funcionan.

## Investigación del HTTP 302 (19/11/2026)
- **URL exacta usada:** `https://sifen-test.set.gov.py/de/ws/consultas/consulta-ruc.wsdl` (POST, SOAP 1.2). Es **idéntica** a la que usa la librería `setapi` en producción, y el mensaje SOAP tiene el mismo formato.
- **Cabecera `Location`:** NO observada. El entorno de la sesión no llega a `sifen-test.set.gov.py` (proxy 403) y la versión desplegada de la función no devolvía las cabeceras.
- **Cliente verificado con Deno 2.9.6:** `node:https` con `key`/`cert` en PEM **envía el certificado de cliente**, mantiene **POST**, la ruta y el cuerpo, y **no sigue redirecciones**. Un 302 recibido es del servidor, no lo provoca nuestro cliente.
- **Hipótesis (sin confirmar):** la librería trata una "página de salida de BIG-IP" como el error típico cuando el portal no acepta la sesión/certificado. Causas posibles: (a) el certificado no se acepta o no trae el RUC de la empresa, (b) falta enviar la cadena de la entidad certificadora, (c) otra causa de acceso.
- **Debilidades corregidas en la función `sifen` (probadas localmente):** elige el certificado cuyo par es la clave privada (antes tomaba el primero del archivo) y **envía la cadena completa**; el número de serie del titular (donde las certificadoras suelen poner CI/RUC) **no se mostraba** por un error de lectura (forge lo llama `serialName`): corregido.
- **Prueba controlada `diagnostico302`:** mismo pedido (1) POST con certificado, (2) POST sin certificado, (3) GET sin certificado; devuelve código, `Location`, servidor y tipo de respuesta. Si (1) difiere de (2): el certificado es el factor. Si son iguales: la causa es el endpoint o el acceso, no el certificado.

## Resultado de las pruebas reales del 19/11/2026 (capturas de la usuaria)
- Certificado: vigente 2026-11-18 → 2027-11-18, emisor CODE100 S.A., `O=CERTIFICADO CUALIFICADO TRIBUTARIO`, `OU=F1`, `serialNumber=CI…` (cédula del representante). **No trae el RUC de la empresa.** 1 solo certificado en el archivo; la clave le corresponde.
- Diagnóstico del 302 (`diagnostico302`): los 3 pedidos (POST con certificado, POST sin certificado, GET sin certificado) responden **igual**: HTTP 302, servidor BigIP, `Location: /vdesk/hangup.php3`, cuerpo vacío. `/vdesk/hangup.php3` es la salida de sesión del portal de acceso (F5 BIG-IP APM) → **la DNIT no autentica la conexión con el certificado enviado**.
- Con o sin certificado da lo mismo, así que o (1) el runtime de Supabase no envía el certificado, o (2) la DNIT lo recibe pero no lo acepta (a nombre del representante sin RUC, o emisor no reconocido). Con Deno 2.9.6 local sí se envía.
- Control agregado `diagnosticoCliente`: envía el certificado a client.badssl.com (servidor público que exige certificado de cliente y responde distinto si no recibe ninguno o si recibe uno que no reconoce) para separar (1) de (2).
- Consultas a hacer en paralelo: a CODE100, si su "Certificado cualificado tributario" (OU=F1) es el que acepta el SIFEN para una E.A.S. o si hay que pedir el de persona jurídica con RUC; a la DNIT, qué certificado/vinculación exige el portal del ambiente de pruebas.

## Emisión implementada (19/11/2026) · acción `emitir` de la función `sifen`
Flujo: lee la venta/cliente/ajustes de la base → reserva número correlativo (`fe`, actualización condicional) → arma el XML (xmlgen v150) → lo firma con el .p12 de los Secrets (modo JS; archivo temporal que se borra) → calcula el QR con la librería y lo **inserta como texto** (sin reescribir el documento) → envía a `/de/ws/sync/recibe.wsdl` con certificado de cliente → interpreta `dEstRes/dProtAut/gResProc` → guarda XML y respuesta en `fe_docs` y el resultado en la venta.
- Ambiente **test**: el resultado va a `venta.inv.test` y NO toca `inv.type/no/cdc` (no marca la venta como facturada). Ambiente **prod**: si es aprobada, `inv = {type:'electronica', no:'001-001-0000001', cdc, estado, protocolo}`.
- Idempotente: si la venta ya tiene factura aprobada en ese ambiente, no emite otra.
- Secrets: `SIFEN_P12_B64`, `SIFEN_P12_PASS`, `SIFEN_CSC_ID` (se completa a 4 dígitos: 1 → 0001), `SIFEN_CSC`. Nunca se devuelven ni se registran.
- **Probado en Deno 2.9.6** (mismo motor que Supabase) contra un servidor simulado de SIFEN que exige certificado de cliente y verifica por su cuenta firma, digest, QR y total: venta contado, venta a crédito con descuento 4% y cliente ocasional, correlatividad, idempotencia, 404 y 401. Sin secretos en los registros.
- Corregido al probar en Deno: las librerías vienen con la función directo o dentro de `.default` (función `pick`).
- **No probado contra la DNIT real** (entorno sin acceso). Pendiente: respuesta real al certificado (ver 302), KuDE (PDF con QR), cancelación, consulta de estado, pasar a producción.

## Requisito del certificado para la autenticación mutua (aportado por la usuaria, 20/11/2026)
Según la **Guía de Pruebas oficial de la DNIT, p. 5, apartado 4.1** (citado por la usuaria; no verificado por mí contra el PDF): el certificado usado para la autenticación mutua debe **contener el RUC del contribuyente emisor** y tener **Extended Key Usage con `clientAuth`**. El Manual Técnico v150 (según la usuaria): TLS 1.2, autenticación mutua, SOAP 1.2, XMLDSig enveloped, X.509 v3, RSA y SHA-256.
- Lo que SÍ se sabe del certificado (capturas): emisor CODE100 S.A.; `O=CERTIFICADO CUALIFICADO TRIBUTARIO`, `OU=F1`, `serialNumber=CI…` (cédula del representante); **sin RUC en el Subject**; **1 solo certificado en el archivo** (sin cadena). **No se conoce** su SAN, su EKU ni su Key Usage (la función no mostraba extensiones).
- Hipótesis H1 reforzada: un certificado de firma de documentos sin `clientAuth` y sin RUC explicaría que el portal BIG-IP no lo autentique.
- Verificación sin tocar Supabase: `certutil -dump` local del .pfx (ver conversación) → revisar SAN, EKU, KU, cadena, versión X.509 y algoritmo.
- **El control `diagnosticoCliente` ya NO usa el certificado de la empresa**: usa un certificado descartable (`CN=DESCARTABLE-SIN-VALOR`) embebido en el código, para comprobar solo si el motor envía certificados de cliente. El certificado real nunca sale hacia servicios de terceros. (Cambio en el repositorio; **no desplegado**.)

## Informe del certificado (20/11/2026, `certificado-info.txt` generado localmente por la usuaria; solo datos públicos)
- X.509 **v3**, firma **sha256RSA**, clave **RSA 2048**, vigente 2026-11-18 → 2027-11-18. Emisor `CN=CODE100 S.A., OU=Prestador Cualificado de Servicios de Confianza, O=ICPP, C=PY` (RUC80080610-7).
- **Subject**: `SERIALNUMBER=CI…` (cédula del representante). **SAN**: rfc822 del titular + **directoryName** con `SERIALNUMBER=RUC80139512-7`, `O=CRISTALAUTO E.A.S. UNIPERSONAL`, `T=REPRESENTANTE LEGAL`, `Description=FIRMA ELECTRÓNICA de nivel medio` → **el RUC de la empresa SÍ está en el certificado (en el SAN)**. Hipótesis anterior ("el certificado no trae el RUC") **refutada** al ver el SAN.
- **Extended Key Usage: clientAuth (1.3.6.1.5.5.7.3.2) y serverAuth**. **Key Usage: digitalSignature, nonRepudiation, keyEncipherment**. Política 1.3.6.1.4.1.55152.1.1.4, "tipo F1".
- **Cadena: el archivo trae SOLO el certificado propio** (0 de la cadena). Intermedia publicada por CODE100 (AIA): `http://pca1.code100.com.py/certs/ca-code100-sa.cer`; CRL: `http://pca1/pca2.code100.com.py/crls/ca-code100-sa.crl`; OCSP: `http://ocsp.code100.com.py/ocsp/ca-code100-sa`.
- Conclusión: cumple lo citado de la Guía de Pruebas §4.1 (RUC en el certificado + clientAuth). Causas que quedan: (a) **la función envía solo la hoja y no la intermedia** (un BIG-IP suele necesitar la cadena para validar el certificado de cliente) y (b) que el motor de Supabase no envíe el certificado de cliente. Siguiente paso: obtener la intermedia (y la raíz) públicas y enviarlas junto con la hoja.

## Reglas que más rechazos causan (a vigilar)
- Las **Notas Técnicas (NT 001–027)** pisan al Manual v150: no alcanza con el manual. Revisar las vigentes para la fecha y ambiente.
- **Código 0160 = XML mal formado.** Puede venir de un campo con valor inválido aunque el XSD pase (teléfono del emisor `dTelEmi`, caracteres no permitidos, patrones numéricos). Registrar siempre código y mensaje completo.
- Identificación del receptor: las NT bajaron el umbral por encima del cual el cliente debe estar identificado (la base de conocimiento NetseWin/sifen-kb cita 7.000.000 Gs. en la NT 24). **Verificar** en el PDF oficial. En la app: pedir RUC o C.I. del cliente en las ventas grandes.
- Los documentos de prueba deben llevar la leyenda "sin valor comercial ni fiscal" (según un proyecto de terceros sobre la Guía de Pruebas). **Verificar.**
- Datos del emisor: teléfono, dirección, actividad económica y códigos de departamento/distrito/ciudad **iguales a los del timbrado/RUC**.
- Ciudad del local: San Lorenzo (MUNICIPIO) = código **6040**, distrito **164** según la tabla de la librería. Departamento Central = 12 (confirmado con la librería).

## Documentos oficiales que hay que leer (DNIT → e-Kuatia → Documentación técnica)
Manual Técnico v150 · Guía de Pruebas · Notas Técnicas 001–027 · Guía de mejores prácticas para la gestión del envío de DE.
El entorno de la sesión no podía abrir www.dnit.gov.py; se creó el entorno personal `david-benitez` con ese host permitido para leerlos en una sesión nueva.

## Datos que faltan del contribuyente (no secretos)
Número de timbrado electrónico y fecha de inicio · código de establecimiento y punto de expedición (¿001/001?) · actividad económica (código) · teléfono y correo del emisor tal como figuran en el RUC.

## Datos del emisor vistos en Marangatú (19/11/2026, captura de la usuaria)
- Razón social: CRISTALAUTO E.A.S. UNIPERSONAL · RUC 80139512-7 · persona jurídica (EAS unipersonal) · estado ACTIVO.
- Domicilio: CENTRAL, SAN LORENZO, BARCEQUILLO · Nicanor Ríos, a cuatro cuadras de la Avda. Pratt Gill.
- Teléfono/celular: (0984) 102671 · **correo registrado en el RUC: dbenitez219@gmail.com** (usar este en el emisor, tiene que coincidir; el de la empresa en la app es cristalauto95@gmail.com).
- Actividades económicas: **45303** (principal) comercio de partes, piezas y accesorios para vehículos automotores · 45209 otros tipos de reparaciones de vehículos automotores N.C.P.
- La pantalla "Administración de establecimientos" pide un **número de timbrado otorgado** (precarga); aún no se sabe cuál es el timbrado electrónico a usar en TEST. No adivinar: confirmar con la Guía de Pruebas / "Generar timbrado facturador electrónico".

## Secretos (nunca por chat ni en el repositorio)
Certificado `.p12/.pfx` y su contraseña, y el CSC de producción → Supabase **Secrets** (la persona los carga ella misma; se guía paso a paso).

## Orden de trabajo
1. Configuración en la app (Ajustes → Factura electrónica) + campos del cliente (tipo de documento, correo).
2. Función `facturar`: genera + firma + CDC + QR, validando contra XSD, con un certificado de prueba propio (sin enviar).
3. Envío al ambiente TEST con el certificado real; corregir rechazos uno por uno.
4. KuDE con QR y botón "Emitir factura" en la venta.
5. Producción: timbrado + CSC reales (Marangatú, requiere estar al día).

## Cadena de certificación (2026-11-20)
- El .pfx de la empresa trae solo el certificado propio (sin la entidad certificadora). Si el portal de la DNIT exige la cadena, un envío "solo hoja" puede ser rechazado.
- Archivos públicos descargados de CODE100 y verificados con openssl: intermedia "CODE100 S.A." (su identificador de clave coincide con el "emisor" del certificado de la empresa; firmada por la raíz) y "Autoridad Certificadora Raíz del Paraguay" (autofirmada, vence 2032-08-07).
- `supabase/functions/sifen/index.ts` ahora envía certificado propio + intermedia en el handshake TLS y verifica la cadena hasta la raíz (forge). El diagnóstico informa cuántos certificados envía y si la cadena queda verificada.
- Prueba local con PKI de prueba y servidor mTLS estricto: solo hoja → rechazado; hoja + intermedia → aceptado. Suite completa en Deno 2.9.6 sin regresiones.
- NO desplegado todavía. Falta autorización de la usuaria; luego diagnóstico por etapas (WSDL, TLS 1.2, mTLS, SOAP).

## Diagnóstico por etapas (autorizado por la usuaria, 2026-11-20)
- Acción `diagnosticoSifen` (solo ambiente de PRUEBAS, no emite): 1) WSDL de las 6 URLs oficiales con `?wsdl`, con y sin certificado, sin seguir redirecciones, leyendo soap:address; 2) TLS por defecto y TLS 1.2 forzado + cadena del servidor; 3) control mTLS con certificado descartable; 4) consulta de RUC SOAP 1.2 (application/soap+xml y application/xml) en la ruta oficial y en la soap:address. Devuelve veredicto en palabras simples.
- Botón "4) Diagnóstico completo por etapas" en Ajustes (SW v8). Probado en Deno contra simulador.
