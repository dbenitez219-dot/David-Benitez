# ZENTRA — Arquitectura y decisiones técnicas

## Stack elegido (y por qué)
| Capa | Tecnología | Justificación |
|---|---|---|
| Lenguaje | TypeScript (strict) | Un solo lenguaje en front y back; tipos reducen errores en lógica de dinero y reglas. |
| Web + API | Next.js 16 (App Router, Server Actions) | Un solo despliegue al inicio, SSR, protección CSRF integrada en Server Actions. El código se separa por módulos para extraer servicios después. |
| Base de datos | PostgreSQL 16 | Relacional, transacciones, JSONB, escalable. Gratis en desarrollo (docker-compose). |
| ORM | Prisma 6 | Migraciones versionadas, tipos generados. |
| Auth | Propia: argon2id + sesiones en BD (cookie httpOnly, token hasheado SHA-256) | Sin costo externo, revocable, control total (bloqueo, auditoría). Se puede migrar a un IdP más adelante. |
| Cifrado | AES-256-GCM (`ENCRYPTION_KEY`) | Para tokens de Meta en reposo. |
| UI | Tailwind CSS 4 | Sistema de diseño con tokens (negro/rojo/blanco). |
| Pruebas | Vitest (+ Playwright para E2E) | Rápido; pruebas de integración contra PostgreSQL real. |
| Colas (Fase 3+) | pg-boss (sobre PostgreSQL) | Evita Redis/servicios de pago al inicio. Se reevalúa si la carga lo exige. |
| IA (Fase 4) | API de Claude (Anthropic) | El asistente consulta datos reales vía herramientas; requiere API key (costo por uso). |

## Separación de módulos (`src/`)
- `app/` — frontend y rutas (auth, app autenticada, admin en Fase 6).
- `server/auth`, `server/tenancy`, `server/audit` — seguridad (Fase 1).
- Futuros: `server/integrations/meta`, `server/decision-engine`, `server/automation`, `server/notifications`, `server/billing/providers/*`, `server/ai`.
- `prisma/` — esquema y migraciones.

## Seguridad aplicada en Fase 1
- Multi-tenant: toda tabla de negocio tiene `organizationId`; `requireOrg()` verifica la pertenencia contra la BD en cada petición y `assertOwned()` evita IDOR. Probado en `tests/auth-tenancy.test.ts`.
- Roles por organización (OWNER/ADMIN/ANALYST/VIEWER) y rol de plataforma (SUPERADMIN).
- Contraseñas argon2id; bloqueo tras 5 fallos; limitador de intentos; respuestas genéricas (no revela si un correo existe).
- Cookies httpOnly, SameSite=Lax, Secure en producción; cabeceras de seguridad (HSTS, X-Frame-Options, etc.).
- Auditoría de registro/login. Automatizaciones: `MANUAL`, desactivadas y en simulación por defecto.
- Pendiente: verificación de correo, 2FA, recuperación de contraseña (Fase 8 / antes de lanzar), CSP estricta.

## Decisiones de producto
- Prueba de 7 días sin tarjeta; el cobro solo con autorización explícita (Fase 6).
- Precios por país en `PlanPrice` (independientes, sin conversión automática).
- ® no se usa hasta verificar el registro de marca. El logo en `src/components/Logo.tsx` es **provisional**: falta el archivo del logo aprobado.
