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
