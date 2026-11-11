# Fase 8 — Lanzamiento: despliegue, operación, monitoreo y verificación

> **Estado honesto.** Todo lo de este documento está construido y probado **localmente**. Lo que NO pude hacer desde aquí: construir la imagen Docker (no hay demonio de Docker en este entorno), ejecutar el CI en GitHub, ni desplegar en un servidor real. Los archivos están validados (sintaxis, `docker compose config`) y la salida autónoma de Next (la misma que usa el contenedor) pasó la prueba completa. El **primer despliegue real hay que hacerlo con calma en un entorno de prueba (staging)** y correr `npm run e2e` contra él antes de abrirlo a clientes.

## 1. Cómo desplegar (servidor propio con Docker)
Necesitas: un servidor Linux (2 CPU / 4 GB RAM alcanza para empezar), Docker con Compose, un dominio cuyo DNS apunte al servidor y los puertos 80/443 abiertos.
1. Copia el proyecto al servidor. `cp .env.production.example .env.production` y completa **todo** (ver tabla abajo). Genera secretos con `openssl rand -hex 32` y la clave de cifrado con `openssl rand -base64 32`.
2. `docker compose -f docker-compose.prod.yml up -d --build`. Se levantan: PostgreSQL, las migraciones (una vez), la app, Caddy (HTTPS automático), el programador de tareas y las copias diarias.
3. Revisa `docker compose logs app`: ahí salen las **advertencias de configuración** (qué funciones quedan desactivadas). Si la configuración es inválida, la app se **niega a arrancar** y dice por qué.
4. Comprueba `https://TU-DOMINIO/api/ready` → `{"status":"ready"}`.
5. Crea tu usuario en la app y conviértelo en propietario (solo desde el servidor):
   `docker compose -f docker-compose.prod.yml run --rm migrate npx tsx scripts/make-admin.ts tu@correo.com`
   Al entrar a `/admin` te obligará a activar la **verificación en dos pasos** y guardar los códigos de recuperación.
6. Prueba de humo en staging: `BASE_URL=https://staging... npm run e2e` (usa la base de pruebas, nunca la de producción).

Alternativas: cualquier plataforma que corra contenedores Node 22 + PostgreSQL 16 (Render, Railway, Fly.io…). Requisitos: ejecutar `prisma migrate deploy` antes de cada versión nueva, las 3 llamadas programadas (abajo) y las variables de la tabla.

## 2. Variables de entorno
| Variable | Obligatoria | Para qué |
|---|---|---|
| `DATABASE_URL`, `ENCRYPTION_KEY` | Sí | PostgreSQL; cifrado de tokens (32 bytes base64) |
| `APP_URL` | Sí (https) | Enlaces de correo, OAuth y webhooks |
| `CRON_SECRET` (≥32) | Sí | Protege `/api/cron/*` |
| `BILLING_WEBHOOK_SECRET` (≥32) | Recomendada | Verifica webhooks de pago |
| `RESEND_API_KEY`, `MAIL_FROM` | **Recomendada fuerte** | Sin esto NO funcionan restablecer contraseña, verificación de correo ni avisos por correo |
| `ERROR_WEBHOOK_URL` | Recomendada | Alertas de errores (compatible con Slack) |
| `META_APP_ID/SECRET/API_VERSION` | Para Meta | Ver `docs/04-META-ADS.md` |
| `ANTHROPIC_API_KEY/MODEL` | Opcional | ZENTRA AI conversacional |
| `ALLOW_SIMULATED_PAYMENTS` | **Nunca en producción real** | Pagos falsos (demos) |
| `AUTOMATION_KILL_SWITCH`, `BILLING_KILL_SWITCH` | Emergencia | Ver §5 |

## 3. Tareas programadas (ya incluidas en `docker-compose.prod.yml`)
`/api/cron/sync` (cada 3 h), `/api/cron/automation` (cada 3 h) y `/api/cron/billing` (diaria), con `Authorization: Bearer $CRON_SECRET`. Cada ejecución queda registrada: `/admin` muestra «Tareas programadas» con 🟢/🔴 y **marca como ATRASADA** cualquiera que no haya tenido éxito en más del doble de su intervalo.

## 4. Monitoreo
- **Disponibilidad**: configura un monitor externo (UptimeRobot, Better Stack…) sobre `/api/ready` (alerta si la base de datos cae) y uno sobre `/api/health`.
- **Errores**: toda excepción del servidor se registra como JSON (con datos sensibles ocultos) y, con `ERROR_WEBHOOK_URL`, llega a tu chat sin repetirse más de una vez cada 5 min. Los fallos de tareas programadas también.
- **Registros**: una línea JSON por evento en la salida estándar del contenedor: guárdalos con la plataforma de logs de tu hosting.
- **Negocio**: `/admin` (usuarios, suscripciones, ingresos, pagos y acciones fallidas, conexiones con error, automatizaciones activas).

## 5. Operación de emergencia
| Situación | Qué hacer |
|---|---|
| Una automatización se porta mal | El cliente usa su **botón de emergencia**; tú puedes poner `AUTOMATION_KILL_SWITCH=true` y reiniciar: **detiene toda acción sobre Meta de todos los clientes** |
| Problema con el proveedor de pagos | `BILLING_KILL_SWITCH=true`: **congela cobros, reintentos y vencimientos** (nadie es cobrado ni pierde acceso por error) |
| Propietario perdió su teléfono y sus códigos | `docker compose run --rm migrate npx tsx scripts/reset-mfa.ts correo` (vuelve a configurarlo al entrar) |
| Despliegue malo | Vuelve a la imagen anterior. Las migraciones solo avanzan: escríbelas **compatibles hacia atrás**; si una migración dañó datos, restaura la copia (§6) |
| Sospecha de filtración de tokens de Meta | Rota el secreto de la app en Meta (invalida los tokens), desconecta cuentas y avisa a los clientes. **Rotar `ENCRYPTION_KEY` aún no está soportado** (ver pendientes) |

## 6. Copias de seguridad y restauración (probadas)
- `scripts/backup.sh` (diaria en Compose): `pg_dump` comprimido, verificación de lectura, suma SHA-256 y retención de 14 días.
- **Copia los archivos de `./backups` FUERA del servidor** (almacenamiento cifrado de otro proveedor). Si el servidor muere con las copias dentro, no hay copia.
- `scripts/restore-check.sh`: restaura la última copia en una base temporal y **compara las filas de todas las tablas** con la original; detecta copias dañadas. Probado: 29 tablas idénticas; una copia alterada fue rechazada. **Hazlo al menos una vez al mes.**
- Recuperación ante desastre: `pg_restore --clean --no-owner -d DATABASE_URL archivo.dump`.

## 7. Qué se verificó (y cómo repetirlo)
| Verificación | Resultado | Comando |
|---|---|---|
| Pruebas unitarias e integración (PostgreSQL real) | **185 de 185** en 13 archivos | `npm test` |
| Tipos | Sin errores | `npm run typecheck` |
| Recorrido de extremo a extremo en navegador real (registro internacional, panel, XSS, pago simulado, ventas, recuperar contraseña, exportar datos, 2FA de propietarios, eliminar cuenta, seguridad HTTP) | **32 de 32**, también sobre la salida autónoma (la del contenedor), 0 errores en el registro del servidor | `npm run e2e` |
| CSP: inyección de manejador inline, URL `javascript:` y script insertado | Los 3 bloqueados; 13 de 13 scripts propios con nonce; 0 violaciones en el recorrido | (incluido en e2e) |
| Copia y restauración | 29 tablas idénticas; copia dañada detectada | `npm run backup` / `npm run restore:check` |
| Carga (20 usuarios simultáneos, 8 s, 4 núcleos, 1 proceso) | `/api/health` 351 req/s; portada y login ~150–170 req/s (p95 <185 ms); **panel y biblioteca ~38 req/s (p95 ≈ 650–730 ms)**; 0 errores | `npm run loadtest -- /dashboard` |
| Dependencias | 0 críticas; 3 altas, todas en la CLI de Prisma (solo compilación) — ver `SECURITY.md` | `npm audit --omit=dev` |

**Lectura de la carga**: ~38 páginas pesadas por segundo ≈ más de 3 millones de vistas al día en un solo proceso: de sobra para el arranque. El panel es lo más pesado porque agrega en memoria; cuando haya miles de cuentas con muchos datos, mover las agregaciones a SQL/vistas y poner caché (ver pendientes). Estos números son de una máquina de desarrollo: repítelos en tu servidor.

## 8. Lista de verificación antes de abrir a clientes
- [ ] Dominio y HTTPS funcionando; `/api/ready` en verde; monitor externo configurado
- [ ] `.env.production` completo, **sin** `ALLOW_SIMULATED_PAYMENTS`; sin advertencias que no entiendas en `docker compose logs app`
- [ ] Correo (Resend) con dominio verificado (SPF/DKIM): probar «Olvidé mi contraseña» de punta a punta
- [ ] Tu usuario propietario con 2FA y códigos de recuperación guardados fuera de línea
- [ ] **Proveedor de pago real integrado y probado** (hoy solo existe el simulado: sin él, nadie puede pagar)
- [ ] App de Meta creada, política de privacidad **final** publicada y App Review aprobado para clientes externos (`docs/04-META-ADS.md`)
- [ ] Textos legales revisados por un abogado (privacidad, términos), datos de la empresa completados; impuestos/facturación definidos con tu contador
- [ ] Copias fuera del servidor y **una prueba de restauración hecha**
- [ ] `npm run e2e` verde contra staging; prueba de carga en tu servidor
- [ ] Traducciones al inglés/portugués revisadas por nativos (si vas a vender en esos mercados)
- [ ] Marca registrada verificada antes de usar ® (el logo se entregó con ®, se retiró)
