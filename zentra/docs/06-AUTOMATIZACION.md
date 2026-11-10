# Fase 5 — Automatización, notificaciones y auditoría

## Principio
Nada real se ejecuta sin autorización. Una cuenta nueva empieza en **modo Manual, desactivada y en simulación**. ZENTRA **nunca aumenta presupuestos** automáticamente y **nunca reactiva** anuncios por su cuenta.

## Modos
| Modo | Qué hace |
|---|---|
| Manual | Analiza, avisa y recomienda. No crea acciones. |
| Asistida | Crea propuestas con su motivo; un administrador aprueba o rechaza cada una. |
| Automática | Además ejecuta las propuestas por reglas, si pasan todas las compuertas. |

## Reglas (por cuenta, campaña o anuncio; gana la más específica)
- **Pausar**: costo máximo por resultado, gasto mínimo, días mínimos de observación y resultados mínimos para confiar en el costo. Exige además impresiones mínimas (criterios de análisis). Un anuncio sin resultados solo se pausa si gastó más del doble del mínimo.
- **Aviso de presupuesto diario**: avisa si el gasto del día supera el máximo; no cambia el presupuesto.
- Pendiente (no incluido): reglas por conjunto de anuncios en la pantalla (el motor ya las soporta), reglas de reactivación/escala.

## Compuertas del ejecutor (`src/server/automation/executor.ts`) — única vía de escritura en Meta
1. **Reclamo atómico** (`PROPOSED → EXECUTING`): evita ejecuciones duplicadas aunque dos procesos coincidan.
2. **Botón de emergencia**: bloquea todo (automático y aprobaciones).
3. Si es automática: modo Automática + activada, **horario permitido** (zona horaria de la organización) y **límite diario** (24 h móviles).
4. **Simulación** (por defecto) o cuenta demo → registra lo que haría, sin tocar nada.
5. Permiso **`ads_management`** concedido y token vigente.
6. **Revalidación del estado real** en Meta justo antes de actuar (si ya estaba pausado, no se hace nada).
7. Ejecución + registro: **motivo, estado anterior, resultado**, quién decidió, auditoría y aviso.
Si una compuerta bloquea, la acción vuelve a «Pendiente» con la nota del motivo. Las propuestas sin decidir **caducan a las 48 h**. La clave de idempotencia (anuncio + día) impide acciones duplicadas.
Activar «automático real» (activo + automático + sin simulación) exige marcar una confirmación explícita.

## Permisos
- Solo **administradores/propietarios** cambian configuración, reglas, aprueban, rechazan, reactivan o usan la emergencia. Analistas y lectores solo ven.
- Meta: por defecto solo `ads_read`. La pantalla «Automatizaciones» ofrece «Autorizar gestión», que pide además `ads_management`; ZENTRA registra lo **realmente concedido** (`/me/permissions`).

## Notificaciones (`/notifications`)
Anuncios ganadores, bajo rendimiento, anuncios pausados/reactivados, gasto inusual, presupuesto superado, problemas de conexión/sincronización, acciones por aprobar y fallos. Cada una explica **qué pasó** y **qué hacer**; sin duplicados (ventana por tipo). **Correo**: las importantes se envían a propietarios/administradores si lo activan y existen `RESEND_API_KEY` y `MAIL_FROM` (sin ellas no se envía nada). **WhatsApp**: pendiente (requiere API oficial y plantillas aprobadas).

## Programación (cron de tu hosting; ambos con `Authorization: Bearer $CRON_SECRET`)
1. `/api/cron/sync` — sincroniza Meta (Fase 3).
2. `/api/cron/automation` — evalúa avisos y reglas de todas las organizaciones (corre después del anterior, p. ej. cada 1–3 h).
También hay un botón «Evaluar ahora» en la pantalla.

## Estado real y límites
- **Las pausas reales no se probaron contra Meta** (sin credenciales): se probaron con respuestas simuladas, incluyendo revalidación, errores, token vencido y escritura sin filtrar el token. La llamada usada es `POST /{ad-id}` con `status=PAUSED|ACTIVE`.
- Pausar/reactivar **clientes externos** exige **Advanced Access a `ads_management`** mediante App Review de Meta (más estricto que `ads_read`).
- El límite diario se comprueba justo antes de cada ejecución; con evaluaciones muy simultáneas podría excederse por una unidad.
- Las cuentas demo y el modo simulación nunca llaman a Meta.
