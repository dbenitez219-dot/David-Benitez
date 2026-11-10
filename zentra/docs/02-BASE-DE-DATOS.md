# Base de datos (ver `prisma/schema.prisma`)
- **Identidad**: User, Organization, Membership (rol), Session, RateLimit.
- **SaaS**: Plan, PlanPrice (por país/moneda), Subscription, Payment.
- **Publicidad**: AdAccount (token cifrado) → Campaign → AdSet → Ad → AdInsightDaily. `isDemo` marca datos de demostración.
- **Automatización**: AutomationSettings (por organización), AutomationRule, AutomationAction (motivo, estado anterior, resultado, `idempotencyKey` anti-duplicados).
- **Notificaciones**: Notification (qué pasó + qué hacer).
- **Comercial**: Customer, Lead, Sale (ingresos, costos).
- **Auditoría**: AuditLog.

Migraciones: `npm run db:migrate` (dev) / `npm run db:deploy` (producción). Seed de planes: `npm run db:seed`.
Copias de seguridad: `pg_dump` programado en el hosting elegido (Fase 8).
