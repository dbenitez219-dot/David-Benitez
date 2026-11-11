# ZENTRA — Seguridad

## Cómo reportar una vulnerabilidad
Escribe a **[COMPLETAR: correo de seguridad]**. No abras un caso público. Responderemos en un plazo razonable y no tomaremos acciones contra quien actúe de buena fe.

## Controles implementados (con su prueba)
| Área | Control | Verificación |
|---|---|---|
| Multi-empresa | Toda tabla de negocio lleva `organizationId`; la pertenencia se comprueba en la base en cada solicitud; protección contra acceso a recursos ajenos (IDOR) | Pruebas de aislamiento en auth, analítica, Meta, automatización, facturación, comercial, IA y privacidad |
| Autenticación | argon2id; bloqueo tras 5 fallos; limitador atómico de intentos (login, registro, IA, reset, exportación); respuestas genéricas (no revela qué correos existen); sesiones con token aleatorio guardado solo como hash, cookie `HttpOnly` + `SameSite=Lax` + `Secure` | `auth-tenancy`, `ratelimit`, `launch` |
| Recuperación de cuenta | Tokens de un solo uso con vencimiento, solo su hash en la base; restablecer o cambiar la contraseña **cierra las demás sesiones**; correo de aviso | `launch` |
| Propietarios de la plataforma | **2FA TOTP obligatoria** (RFC 6238, probada con sus vectores oficiales), códigos de un solo uso (sin repetición) y de recuperación, reverificación cada 12 h, intentos limitados; el panel responde 404 a los demás; cada operación revalida el rol | `launch`, `e2e` |
| Secretos | Tokens de Meta y de medios de pago cifrados con AES-256-GCM; el token de Meta viaja en cabecera (no en URL) con `appsecret_proof`; registros con valores sensibles ocultos; validación de entorno al arrancar | `crypto`, `meta`, `launch` |
| Navegador | CSP estricta con nonce por solicitud (bloquea XSS por scripts, manejadores inline y `javascript:`), HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP | `e2e`, `launch` |
| Entradas | Validación con zod en servidor; consultas parametrizadas (Prisma); React escapa la salida (probado con un nombre de anuncio malicioso) | `e2e` |
| APIs | Tareas programadas con secreto (comparación en tiempo constante); webhooks con firma HMAC verificada e idempotentes; sin CORS abierto | `billing`, `meta`, `e2e` |
| Automatización | Apagada y en simulación por defecto; única vía de escritura con compuertas, reclamo atómico, revalidación del estado real, interruptor por cliente y **global** | `automation`, `launch` |
| Auditoría | Registro de registro/ingreso, cambios de configuración, decisiones de automatización, pagos, acciones de administración | todas |
| Privacidad (GDPR) | Exportar los propios datos (sin credenciales) y eliminar la cuenta/organización con contraseña y confirmación; revocación del permiso de Meta; auditoría anonimizada; solo cookies esenciales (sesión e idioma) | `launch`, `e2e` |
| Continuidad | Copias verificadas con suma de control y prueba de restauración | `scripts/*.sh` |

## Riesgos conocidos y aceptados
- **3 avisos altos de `npm audit`** (DeepmergeTS, vía `prisma` → `@prisma/config`): afectan a la **CLI de Prisma en tiempo de compilación/migración**, no al servidor en ejecución. Arreglarlos exige saltar a Prisma 7 (cambio incompatible). Se actualizará planificadamente; no hay vulnerabilidades críticas.
- `style-src 'unsafe-inline'` (estilos en línea de React/Tailwind): no permite ejecutar scripts.
- No hay prueba de penetración externa ni WAF; se recomienda una revisión independiente antes de escalar.
- La protección CSRF descansa en el control de origen de las acciones de servidor de Next.js + `SameSite=Lax`; las rutas POST públicas exigen firma o secreto.

## Limitaciones por resolver (ver `docs/10-PENDIENTES.md`)
2FA opcional para usuarios normales; rotación de `ENCRYPTION_KEY` (hoy no soportada); política de retención de auditoría y de registros de pagos (consultar con un contador/abogado: la eliminación de cuenta borra también los pagos de esa organización); aviso por correo de inicios de sesión nuevos; revisión de las políticas de privacidad y términos por un abogado.
