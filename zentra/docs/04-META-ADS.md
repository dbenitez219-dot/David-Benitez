# Integración con Meta Ads (Fase 3)

## Estado real
| Pieza | Estado |
|---|---|
| OAuth (`/api/meta/connect` → `/api/meta/callback`), token de larga duración, cifrado AES-256-GCM | Implementado. Probado con respuestas simuladas. **No probado contra Meta real** (faltan credenciales). |
| Lectura de cuentas, campañas, conjuntos, anuncios, presupuestos, estados, miniaturas | Implementado (simulado). |
| Estadísticas diarias por anuncio (gasto, impresiones, alcance, clics, mensajes, leads, compras, ingresos) | Implementado (simulado). |
| Reintentos con espera ante límites de tasa/errores transitorios, `appsecret_proof`, token en cabecera | Implementado y probado. |
| Vencimiento/revocación de token: cuenta marcada, notificación con qué hacer, datos conservados | Implementado y probado. |
| `deauthorize` y eliminación de datos (con verificación de `signed_request`), página de estado | Implementado y probado. |
| Sincronización programada `/api/cron/sync` (protegida con `CRON_SECRET`) y botón «Sincronizar ahora» | Implementado. |
| Escritura (pausar/reactivar anuncios) | **No incluido**: Fase 5. Solo se pide el permiso `ads_read`. |
| Google Ads / TikTok Ads | Preparado en el modelo (`AdPlatform`); sin integración. |

## Cómo habilitarlo (lo que necesitas hacer tú)
1. Entra a developers.facebook.com → **Crear app** (tipo *Business*). Añade el producto **Marketing API** y **Facebook Login for Business / Facebook Login**.
2. En *Configuración de la app → Básica*: copia **App ID** y **App Secret**; añade la **URL de la política de privacidad** (`https://TU-DOMINIO/privacy`, completa antes el borrador) y la **URL de eliminación de datos** (`https://TU-DOMINIO/api/meta/data-deletion`).
3. En Facebook Login → Configuración: **URI de redirección OAuth válida** = `https://TU-DOMINIO/api/meta/callback`; **URL de desautorización** = `https://TU-DOMINIO/api/meta/deauthorize`.
4. Carga en el servidor: `META_APP_ID`, `META_APP_SECRET`, `APP_URL`, `CRON_SECRET`, `ENCRYPTION_KEY`. Verifica `META_API_VERSION` en el changelog de Meta (las versiones caducan ~2 años).
5. **Modo desarrollo**: solo funcionan usuarios con rol en la app (tú y testers) y sus cuentas publicitarias. Suficiente para probar con tus propias cuentas.
6. Programa la sincronización (p. ej. cada 1–3 h): `curl -H "Authorization: Bearer $CRON_SECRET" https://TU-DOMINIO/api/cron/sync` desde el cron de tu hosting.
7. Para clientes externos: **verificación de empresa** + **App Review** con **Advanced Access** a `ads_read` (video de demostración, política de privacidad pública, justificación de uso). Tarda semanas.

## Decisiones y límites a conocer
- Las cuentas se registran con la sincronización **desactivada**; el usuario activa cuáles quiere usar. Límite por plan (hoy 1, por defecto, hasta la Fase 6).
- El token de larga duración dura ~60 días y **no se renueva solo**: ZENTRA avisa 7 días antes y, si vence, pide reconectar sin borrar datos.
- Estadísticas: primera sincronización 90 días; las siguientes releen 14 días (Meta ajusta atribución con retraso). Se reemplazan por (anuncio, día): idempotente.
- «Resultado»: ventas = compras, leads = `lead`, el resto = conversaciones de mensajería iniciadas. No se suman tipos equivalentes (evita doble conteo). **Limitación**: campañas de tráfico/interacción se tratan como «mensajes»; la Fase 4 lo afinará con el destino del conjunto de anuncios.
- Los ingresos solo aparecen si Meta informa valor de compra (píxel/API de conversiones bien configurados). Si no, el ROAS se muestra como «—».
- Las fechas de Meta están en la zona horaria de la cuenta publicitaria.
- Pendiente de producción: cola de tareas (pg-boss) en lugar de cron secuencial si hay muchas cuentas; sincronización incremental por lotes.
