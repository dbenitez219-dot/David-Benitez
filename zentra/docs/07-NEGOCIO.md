# Fase 6 — Negocio: planes, prueba gratuita, suscripciones, pagos, ventas y panel administrador

## Planes (precios configurables; los de Paraguay son los iniciales)
| | Start · Gs. 99.999 | Business · Gs. 199.999 | Agency · Gs. 399.999 |
|---|---|---|---|
| Cuentas publicitarias | 1 | 3 | 10 |
| IA | Reglas básicas | ZENTRA AI conversacional | ZENTRA AI conversacional |
| Reglas de automatización | hasta 2 | hasta 20 | hasta 100 |
| Análisis comercial (clientes, ventas, rentabilidad) | — | ✔ | ✔ |
Los límites se **hacen cumplir** (sincronización, reglas, IA, ventas). Precios y bandera de impuestos viven en `PlanPrice` y se editan en `/admin/plans`: **cada país/moneda tiene su precio propio, sin conversión automática**; sin precio para un país, ese plan no se puede pagar allí.

## Prueba gratuita (7 días, sin tarjeta)
Se inicia al registrarse con el plan elegido. Avisos **3 días** y **24 horas** antes (notificación + correo si está activo), vencimiento automático y control de acceso. **Nunca se cobra al terminar la prueba.** Una prueba por organización.

## Ciclo de la suscripción (`src/server/billing/service.ts`)
- **Pago**: el checkout crea un pago *pendiente* y manda al cliente a la página del proveedor; la suscripción solo se activa cuando el proveedor confirma (webhook o retorno). Resolver un pago es **idempotente** (un solo proceso puede resolverlo) y los webhooks se deduplican por id de evento y verifican firma.
- **Cobro automático**: solo si el cliente marca una casilla de **autorización expresa** al pagar (se registra fecha y se guarda únicamente un *token* del proveedor, cifrado; nunca datos de tarjeta). Sin autorización **no se cobra**: el plan vence con aviso previo.
- **Renovación** con el precio vigente cuando el cliente se suscribió (los cambios de precio no afectan a clientes actuales).
- **Reintentos**: si falla la renovación → *en mora* con acceso en gracia; reintentos a +1, +3 y +5 días; al cuarto fallo la suscripción **vence** (datos intactos) con aviso.
- **Cancelación**: acceso hasta el fin del período pagado, sin más cobros; se puede deshacer (el cobro automático requiere nueva autorización).
- **Cambio de plan**: aplica de inmediato (sin prorrateo). **Renovación manual**: extiende desde el fin vigente.
- **Sin suscripción activa**: los datos **se conservan**; quedan limitadas sincronización, automatizaciones, IA, reglas y registro de ventas.
- Programar `GET/POST /api/cron/billing` (`Authorization: Bearer $CRON_SECRET`) una vez al día.

## Pagos: arquitectura modular
`PaymentProvider` (`src/server/billing/providers/types.ts`): cada proveedor declara países, monedas y si admite cobro recurrente; no se asume que uno sirva en todos los mercados. Impuesto por mercado en `PlanPrice` (incluido o adicional) y registrado en cada pago.

**Estado real: NO hay ningún proveedor real integrado.** Existe un proveedor **simulado** (claramente marcado en pantalla, historial y panel como «SIMULADO»; no cobra ni se conecta a ningún banco). En **producción está deshabilitado** salvo `ALLOW_SIMULATED_PAYMENTS=true` (solo demos). Sin proveedor real, en producción los pagos quedan «no habilitados».

Para cobrar de verdad hay que **elegir e integrar un proveedor** (no inventado aquí). Candidatos a evaluar, a **verificar directamente con cada uno**: Bancard y uPay (Paraguay) o una pasarela internacional que acepte a la entidad legal del propietario. Preguntas clave: ¿opera en tu país y moneda?, ¿ofrece tokenización/cobro recurrente?, ¿webhooks firmados?, comisiones, requisitos legales y fiscales. Integrarlo = implementar `PaymentProvider` (≈1 archivo) y registrarlo en `providers/index.ts`.

## Análisis comercial (`/sales`, planes Business/Agency)
Registro de **leads, clientes y ventas reales** (ingreso, costo, campaña de atribución). Combina la inversión de Meta con las ventas registradas: **costo real por cliente, ROAS real, ganancia tras publicidad, margen y rentabilidad por campaña**. No se asume que un mensaje sea una venta; sin ventas registradas se muestra «—». Ventas en otra moneda no se mezclan. ZENTRA AI usa estos datos cuando existen. Futuro: CRM, formularios, WhatsApp y conversiones offline.

## Panel administrador (`/admin`, solo propietarios)
Resumen (usuarios, empresas, suscripciones, ingresos, pagos y acciones fallidas, conexiones con error, automatizaciones activas), empresas (suspender/reactivar), usuarios (suspender cierra sesiones), planes y precios por país, pagos. **404 para cualquiera que no sea propietario**; cada operación revalida el rol en la base de datos y queda auditada. Muestra solo agregados: nunca datos publicitarios ni credenciales. Crear un propietario se hace **solo desde el servidor**: `npm run admin:promote -- correo@ejemplo.com` (el usuario debe estar registrado).

## Qué falta / límites
- **Proveedor de pago real** (ver arriba).
- **Informes** (Start: «informes», Business: «avanzados», Agency: «para clientes»): **no están construidos todavía**.
- Agency: «gestión de múltiples clientes», «panel centralizado» y «roles y permisos» están como límites del plan, pero **la interfaz multi-cliente no está construida**.
- Sin prorrateo en cambios de plan; sin facturación electrónica/factura legal (impuestos solo se calculan y registran); sin 2FA para propietarios (recomendado antes de lanzar).
- Los avisos de correo requieren `RESEND_API_KEY` y `MAIL_FROM`.

## Qué necesitas tú
Definir con tu contador/abogado el **IVA/impuestos** y la facturación por país; **elegir y contratar el proveedor de pago**; configurar `BILLING_WEBHOOK_SECRET` y el cron diario de facturación; crear tu usuario propietario con `admin:promote`.
