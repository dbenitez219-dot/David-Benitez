# Costos, aprobaciones externas, riesgos y cronograma

## Costos externos (estimados; verificar precios vigentes)
- Hosting app + PostgreSQL gestionado: ~US$ 25–60/mes al inicio.
- Dominio y correo transaccional (Resend/Postmark/SES): ~US$ 0–20/mes al inicio.
- API de IA (Claude): variable según uso; controlable con límites por plan.
- Pasarela de pagos: comisión por transacción (uPay/Bancard/Stripe u otra, según tu entidad legal).
- Meta Marketing API: sin costo de uso, pero requiere cuenta de desarrollador y verificación de empresa.
- Desarrollo: sin servicios de pago obligatorios (PostgreSQL local, Next.js, Tailwind son gratuitos).

## Aprobaciones de Meta (la mayor dependencia externa)
1. Cuenta de Meta for Developers y una **App** de tipo Business.
2. **Verificación de empresa** (Business Verification) en Meta Business.
3. **App Review** para `ads_read` y `ads_management` (con Advanced Access) — requiere política de privacidad pública, URL de eliminación de datos, y video de demostración del uso.
4. Mientras tanto se puede desarrollar y probar con **Standard Access** sobre tus propias cuentas.
Hasta tener esto, la Fase 3 no puede leer cuentas de terceros.

## Otras credenciales necesarias
- Proveedor de pagos (contrato comercial, claves, webhooks) — Fase 6.
- Proveedor de correo — Fase 5.
- API key de IA — Fase 4.
- Logo aprobado (archivo) — Fase 1/2.
- WhatsApp Business API oficial: verificación de Meta + plantillas aprobadas (futuro).

## Riesgos y limitaciones
- Rechazo o demora del App Review de Meta (semanas). Mitigación: iniciar el trámite pronto.
- Límites de tasa de la Marketing API: sincronización por lotes, caché y reintentos con backoff.
- Pagos recurrentes en Paraguay: no todos los proveedores soportan cobros recurrentes automáticos con tarjeta; puede requerir tokenización de tarjeta o cobros manuales asistidos. A validar con uPay/Bancard.
- Datos insuficientes: el motor evita decisiones precipitadas (mínimos configurables).
- Cumplimiento (GDPR, privacidad): exportación/eliminación de datos y política pública antes de lanzar.
- Automatización que pausa anuncios reales: simulación obligatoria primero, límites diarios, botón de emergencia, idempotencia.

## Cronograma realista (1 desarrollador + Claude Code, orientativo)
| Fase | Duración |
|---|---|
| 1 Fundamentos | ✅ hecha en esta entrega |
| 2 Experiencia (dashboard, biblioteca, demo) | 1–2 semanas |
| 3 Integración Meta | 2–3 semanas (+ espera de aprobación) |
| 4 Inteligencia | 2–3 semanas |
| 5 Automatización | 2–3 semanas |
| 6 Negocio y pagos | 3–4 semanas |
| 7 Globalización | 2 semanas |
| 8 Lanzamiento | 2–3 semanas |
