# Registro consolidado de pendientes y estado real (fin de la Fase 8)

Este es el documento para decidir qué hacer antes y después de abrir a clientes. Aquí no hay nada oculto: separa lo que **funciona de verdad**, lo que **solo está probado con simulaciones** y lo que **no existe todavía**.

## 1. Estado real por módulo
| Módulo | Estado | Probado con |
|---|---|---|
| Cuentas, multi-empresa, seguridad, auditoría | ✅ Real | PostgreSQL real, navegador real |
| Panel, biblioteca de anuncios, comparador, clasificación, recomendaciones | ✅ Real | Datos de demostración (ficticios) |
| **Conexión con Meta Ads** (OAuth, sincronización, tokens, límites) | 🟡 Código completo | **Solo respuestas simuladas de Meta; nunca contra Meta real** |
| **Pausar/reactivar anuncios** (automatización) | 🟡 Motor completo y seguro | **Solo Meta simulado**; requiere Advanced Access a `ads_management` |
| **ZENTRA AI** conversacional | 🟡 Código completo | **Cliente simulado**; nunca con la API real de Anthropic |
| ZENTRA AI por reglas (sin clave) | ✅ Real | Datos de demostración y ventas registradas |
| Planes, prueba de 7 días, suscripciones, reintentos, cancelación | ✅ Real | PostgreSQL real |
| **Pagos reales** | ❌ **No existe**: solo un proveedor **simulado** (marcado y bloqueado en producción) | — |
| Análisis comercial (leads, clientes, ventas, rentabilidad real) | ✅ Real | PostgreSQL real |
| Idiomas ES/EN/PT, países, teléfonos, formatos | ✅ Real, 🟡 traducción **parcial** | Navegador real |
| Panel administrador con 2FA | ✅ Real | Navegador real |
| Despliegue (Docker, Compose, CI) | 🟡 Escrito y validado | **Imagen Docker no construida; CI no ejecutado; nunca desplegado en un servidor** |

## 2. Lo que tienes que hacer TÚ (cuentas, aprobaciones, decisiones)
| Qué | Por qué / dónde |
|---|---|
| **Elegir y contratar el proveedor de pago** (Bancard, uPay u otro compatible con tu entidad) | Sin esto nadie puede pagar. Verifica con el proveedor: país/moneda, cobro recurrente, firma de webhooks, comisiones. Luego se integra implementando `PaymentProvider` |
| **App de Meta** + verificación de empresa + **App Review** (`ads_read` y `ads_management`, Advanced Access) | Semanas de espera. Pasos en `docs/04-META-ADS.md`. Hasta entonces solo funcionan tus propias cuentas |
| Cuenta de correo transaccional (Resend u otro) con dominio verificado | Sin correo no sirven restablecer contraseña, verificación ni avisos |
| API key de Anthropic (opcional) | Activa el modo conversacional de ZENTRA AI |
| Servidor/hosting, dominio, monitor de disponibilidad, almacenamiento externo de copias | `docs/09-LANZAMIENTO.md` |
| **Textos legales** revisados por un abogado: política de privacidad (hoy es un **borrador** con campos por completar), términos, datos de la empresa | Meta exige una política pública; la ley, también |
| **Impuestos y facturación** por país con tu contador (hoy se calcula y registra el impuesto, pero no hay factura legal) | Define también cuánto tiempo conservar los pagos (hoy borrar una cuenta borra sus pagos) |
| Registro de la marca ZENTRA y verificación antes de usar ® | El logo se entregó con ®; se retiró |
| Revisión de traducciones EN/PT por nativos; definir en qué países empiezas a vender y sus precios | |
| Correo de seguridad en `SECURITY.md` | |

## 3. Lo que falta construir
### Antes de vender (porque los planes lo prometen o es imprescindible)
1. **Pasarela de pago real** (arriba).
2. **Informes**: Start promete «informes», Business «avanzados», Agency «para clientes». **No están construidos.** Construirlos o quitarlos de la oferta antes de cobrar.
3. **Invitar miembros a una organización y gestionar roles**: el modelo de datos y los permisos existen (propietario/admin/analista/lector), pero **no hay pantalla para invitar usuarios**: hoy cada organización tiene su creador. Imprescindible para equipos y para Agency.
4. **Agency**: «gestión de múltiples clientes» y «panel centralizado» están solo como límites del plan; la interfaz multi-cliente no existe.

### Importantes
- Probar Meta (sincronización y pausas) y la IA contra servicios reales, en cuentas propias, antes de confiar en ellos.
- Traducir las pantallas que siguen solo en español (ver `docs/08-GLOBALIZACION.md`) y los avisos/correos que genera el sistema.
- 2FA opcional para usuarios normales; aviso por correo de inicios de sesión nuevos.
- **Rotación de `ENCRYPTION_KEY`** (hoy cambiarla invalida los tokens guardados).
- Escalado: agregaciones del panel en SQL/vistas + caché; paginación en la biblioteca de anuncios; cola de tareas (p. ej. pg-boss) en vez del cron secuencial.
- Retención de auditoría y de registros de pagos; visor de auditoría en el panel admin.
- Prisma 7 (resuelve los 3 avisos altos de la CLI), revisión de seguridad independiente.

### Después
WhatsApp oficial para avisos; Google Ads y TikTok Ads; integración con CRM, formularios y conversiones offline; factura electrónica; prorrateo al cambiar de plan; reglas por conjunto de anuncios en la interfaz; recomendaciones de presupuesto.

## 4. Orden sugerido
1) Servidor de prueba (staging) + correo + `npm run e2e` → 2) App de Meta en modo desarrollo y prueba con tus cuentas → 3) Proveedor de pago e integración → 4) Invitar miembros + informes → 5) Textos legales, impuestos, traducciones → 6) App Review de Meta → 7) Abrir a los primeros clientes (pocos, con seguimiento) → 8) Escalado y el resto.
