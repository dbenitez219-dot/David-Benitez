# ZENTRA — Tu publicidad. Más inteligente.

Plataforma SaaS internacional de inteligencia artificial para analizar, optimizar y automatizar campañas publicitarias (Meta Ads primero). Next.js 16 · TypeScript · PostgreSQL · Prisma · Tailwind.

> **Estado:** las 8 fases del plan están construidas y probadas **localmente**. Antes de abrir a clientes hay pendientes que dependen de cuentas externas (pagos, Meta, correo) y de decisiones legales: lee **[`docs/10-PENDIENTES.md`](docs/10-PENDIENTES.md)** (estado real de cada módulo) y **[`docs/09-LANZAMIENTO.md`](docs/09-LANZAMIENTO.md)** (despliegue y lista de verificación).

## Puesta en marcha (desarrollo)
```bash
cp .env.example .env            # completa ENCRYPTION_KEY: openssl rand -base64 32
npm install                     # instala y copia las banderas a public/flags
npx prisma migrate deploy && npm run db:seed
npm run dev                     # http://localhost:3000
```
Necesitas Node 22+ y PostgreSQL 16 (o `docker compose up -d`). Para las pruebas crea también la base `zentra_test` (ver `tests/setup.ts`).

## Comandos
| | |
|---|---|
| `npm run check` | Tipos + 185 pruebas (PostgreSQL real) |
| `npm run e2e` | Recorrido completo en navegador real (32 comprobaciones) — **solo contra una base de pruebas** |
| `npm run backup` · `npm run restore:check` | Copia de seguridad y prueba de restauración |
| `npm run loadtest -- /dashboard` | Prueba de carga sencilla |
| `npm run admin:promote -- correo` · `admin:reset-mfa` | Gestión de propietarios (solo en el servidor) |
| `npm run build` · `docker compose -f docker-compose.prod.yml up -d --build` | Producción |

## Documentación (`docs/`)
| Documento | Contenido |
|---|---|
| [`01-ARQUITECTURA`](docs/01-ARQUITECTURA.md) · [`02-BASE-DE-DATOS`](docs/02-BASE-DE-DATOS.md) · [`03-COSTOS…`](docs/03-COSTOS-APROBACIONES-RIESGOS-CRONOGRAMA.md) | Decisiones técnicas, modelo de datos, costos, aprobaciones de Meta, riesgos |
| [`04-META-ADS`](docs/04-META-ADS.md) | Conexión con Meta: cómo habilitarla y límites |
| [`05-INTELIGENCIA-Y-ASISTENTE`](docs/05-INTELIGENCIA-Y-ASISTENTE.md) | Clasificación, recomendaciones, ZENTRA AI |
| [`06-AUTOMATIZACION`](docs/06-AUTOMATIZACION.md) | Reglas, modos, compuertas de seguridad, notificaciones |
| [`07-NEGOCIO`](docs/07-NEGOCIO.md) | Planes, suscripciones, pagos, módulo comercial, panel admin |
| [`08-GLOBALIZACION`](docs/08-GLOBALIZACION.md) | Países, idiomas, monedas, formatos |
| [`09-LANZAMIENTO`](docs/09-LANZAMIENTO.md) | Despliegue, operación, monitoreo, copias, verificaciones, checklist |
| [`10-PENDIENTES`](docs/10-PENDIENTES.md) | **Estado real y lo que falta** |
| [`SECURITY.md`](SECURITY.md) | Controles, riesgos aceptados, cómo reportar |

## Principios de diseño
Nada real se ejecuta sin autorización (automatizaciones apagadas y en simulación por defecto) · nunca se inventan datos (sin datos, se muestra «—») · un mensaje o un lead no es una venta · los datos nunca se borran por falta de pago · ningún cobro sin autorización expresa · cada decisión queda registrada y es verificable.
