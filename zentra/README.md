# ZENTRA — Tu publicidad. Más inteligente.

Plataforma SaaS de inteligencia artificial para publicidad. Estado: **Fase 1 (fundamentos)**.

## Requisitos
Node 22+, PostgreSQL 16 (o `docker compose up -d`).

## Puesta en marcha
```bash
cd zentra
cp .env.example .env        # completa ENCRYPTION_KEY: openssl rand -base64 32
npm install
npm run db:deploy && npm run db:seed
npm run dev                 # http://localhost:3000
npm test                    # requiere la BD "zentra_test" (ver tests/setup.ts)
```
Docs en `docs/`.

## Fase 2 — Experiencia (hecha)
- **Panel** (`/dashboard`): inversión, resultados, ingresos, ROAS y costo por resultado con variación frente al período anterior; contadores de anuncios; gráfico interactivo; filtros por fecha, cuenta, campaña, conjunto y anuncio.
- **Biblioteca** (`/ads`): tarjetas con métricas, clasificación, tendencia; búsqueda, filtros, orden y comparación (`/ads/compare`, hasta 4).
- **Datos de demostración**: botón en el Panel (solo ADMIN/OWNER). Se guardan en una cuenta `isDemo` y la interfaz muestra siempre un aviso "DATOS DE DEMOSTRACIÓN". Se pueden eliminar.
- **Reglas de honestidad**: sin datos no se inventan métricas (se muestra "—"); ROAS solo con ingresos informados; "resultado" depende del objetivo de la campaña (un mensaje no es una venta).
- **Clasificación básica** (`src/server/analytics/classify.ts`): costo por resultado relativo a la mediana de su objetivo; no juzga con datos insuficientes. El motor configurable por cliente llega en las Fases 4–5.
- Agregaciones hechas en memoria: suficiente para la demo; con datos reales de Meta (Fase 3) se pasarán a SQL/vistas materializadas.

## Fase 3 — Integración Meta (hecha, pendiente de credenciales)
Ver `docs/04-META-ADS.md`: OAuth, sincronización, manejo de tokens/límites, deauthorize y eliminación de datos. Probado con respuestas simuladas de la Graph API; requiere crear la app en Meta para usarse con cuentas reales.

## Fase 4 — Inteligencia (hecha)
Criterios de análisis por cliente, clasificación con motivos, recomendaciones con evidencia y asistente ZENTRA AI (IA o reglas). Ver `docs/05-INTELIGENCIA-Y-ASISTENTE.md`.

## Fase 5 — Automatización (hecha, pausas reales pendientes de credenciales)
Reglas, modos manual/asistido/automático, botón de emergencia, notificaciones, correo preparado y registro de decisiones. Ver `docs/06-AUTOMATIZACION.md`.

## Fase 6 — Negocio (hecha; falta el proveedor de pago real)
Planes con límites aplicados, prueba de 7 días, suscripciones con reintentos y cancelación, pagos modulares (solo simulado), análisis comercial y panel administrador. Ver `docs/07-NEGOCIO.md`.

## Fase 7 — Globalización (hecha)
Selector de países con banderas, teléfonos validados por país, registro internacional, español/inglés/portugués, formatos y zona horaria regionales. Ver `docs/08-GLOBALIZACION.md` (incluye qué pantallas siguen solo en español).
