# VITARA — Arquitectura, costos, riesgos y etapas

> Documento vivo. Los costos son **estimaciones de orden de magnitud** (los precios de los proveedores cambian: verificarlos antes de contratar).

## 1. Visión general

```
┌──────────────────────────┐        ┌────────────────────────────────────────────┐
│ App Expo (iOS/Android/Web)│  HTTPS │ Supabase                                   │
│  React Native + Router    │◄──────►│  Auth (email+contraseña, JWT)              │
│  Solo clave ANON pública  │        │  Postgres + RLS (aislamiento por usuario)  │
│  Tokens en SecureStore    │        │  Storage privado (fotos, URLs firmadas)    │
└──────────────────────────┘        │  Edge Functions (Deno) ◄── claves secretas │
          ▲                          │     ├─ coach-chat / plan-training          │
          │ push                     │     ├─ plan-nutrition / analyze-meal       │
 ┌────────┴────────┐                 │     └─ send-reminders (cron)               │
 │ Expo Push Service│◄───────────────│  pg_cron: dispara recordatorios            │
 └─────────────────┘                 └───────────────┬────────────────────────────┘
                                                      │ solo desde el servidor
                                              ┌───────▼────────┐
                                              │ API de IA       │
                                              │ (modelo multimodal)│
                                              └────────────────┘
```

Principios:
1. **El cliente nunca tiene claves secretas.** Toda llamada a IA y todo envío de push pasan por Edge Functions.
2. **La seguridad vive en la base de datos** (Row Level Security), no en la app. Si la app falla, los datos siguen protegidos.
3. **Datos de pareja = consentimiento explícito por categoría.** El compañero nunca lee tablas ajenas directamente; solo a través de funciones/vistas que comprueban el consentimiento.
4. **La IA no inventa**: devuelve valores con rango de incertidumbre y marca lo no identificado; el usuario corrige antes de guardar.
5. **Sin datos ficticios**: las pantallas vacías muestran estados vacíos, nunca cifras de relleno.

## 2. Tecnologías

| Capa | Elección | Motivo |
|---|---|---|
| App | Expo SDK 58, React Native, TypeScript, Expo Router | Un código para iOS, Android y web responsive |
| Estado/datos | `@supabase/supabase-js` + React Context (se añadirá TanStack Query en Etapa 2) | Simple y suficiente |
| Animaciones | Reanimated | Animaciones sutiles nativas |
| Backend | Supabase (Postgres, Auth, Storage, Edge Functions, pg_cron) | Todo gestionado, RLS nativa |
| IA | Modelo multimodal (visión + chat) invocado **solo desde Edge Functions** | Análisis de comidas y chat |
| Push | Expo Push Notifications | Un solo servicio para iOS/Android |
| i18n | Diccionarios por idioma (`src/i18n`), español primero | Preparado para más idiomas |
| Salud (futuro) | Apple HealthKit / Health Connect (requiere build nativo, `expo-dev-client`) | Etapa 3+ |

Proveedor de IA (decidido en la Etapa 2): Claude (Anthropic) mediante `supabase/functions/_shared/ai.ts`, modelo configurable con `ANTHROPIC_MODEL`. La IA propone; el código calcula metas y valida toda salida (`_shared/safety.ts`).

## 3. Modelo de datos (Etapa 1 implementada; el resto planificado)

**Etapa 1 (`supabase/migrations/0001_core.sql`)**
- `profiles` — datos básicos de la persona (nombre, nacimiento, sexo biológico para estimaciones, identidad de género libre, altura, peso, objetivo).
- `health_profiles` — salud sensible (lesiones, condiciones, medicamentos, alergias). Solo el dueño; consentimiento propio de tratamiento de datos de salud.
- `preferences` — entrenamiento, comidas, sueño, objetivos, zona horaria, país.
- `body_measurements` — peso y medidas con fecha (historial).
- `couples`, `couple_members`, `couple_invites` (código guardado como hash, caducidad 48 h, un solo uso, límite de intentos).
- `sharing_consents` — por categoría (entrenamientos, peso, agua, sueño, racha, nutrición, fotos); apagado por defecto.
- Storage privado: `progress-photos`, `meal-photos` (carpeta = id de usuario).

**Planificado**: `workout_plans/sessions/set_logs`, `exercises`, `nutrition_plans`, `meal_logs` (foto obligatoria o `incident_reason`), `meal_log_items`, `water_logs`, `supplements`, `supplement_intakes`, `sleep_logs`, `challenges`, `streak_days`, `achievements`, `chat_messages`, `notification_settings`, `push_tokens`.

## 4. Seguridad y privacidad

- Auth Supabase (contraseñas con hash, JWT de vida corta, refresh token en `expo-secure-store`).
- RLS activada en **todas** las tablas; políticas `user_id = auth.uid()`.
- Pareja: funciones `security definer` con `search_path` fijo; el cliente no escribe `couple_members` directamente.
- Cifrado en tránsito (TLS) y en reposo (el de Supabase/AWS). Para datos médicos se evaluará cifrado a nivel de columna (pgsodium/Vault) en la Etapa 3.
- Fotos: buckets privados, acceso por URL firmada de corta duración; permisos de cámara/galería solo al usarlos.
- Derechos: exportar (`export_my_data()`) y eliminar cuenta/datos (`delete_my_account()`), ambas ya en la migración.
- Edge Functions de IA: validan el JWT, aplican límite de uso por usuario y no registran el contenido de las fotos.
- No se envía a la IA nada que identifique al usuario (nombre, correo); solo los datos necesarios para la consulta.

## 5. Costos estimados (2 usuarios, uso diario)

| Concepto | Costo aproximado |
|---|---|
| Supabase Free (desarrollo / uso personal) | 0 USD (pausa tras inactividad; sin backups diarios) |
| Supabase Pro (recomendado en uso real: backups, sin pausa) | ~25 USD/mes |
| IA multimodal (≈ 4 fotos + 20 mensajes por persona/día) | ~3–15 USD/mes según modelo |
| Expo / EAS (builds) | Gratis para builds limitados; plan de pago opcional |
| Push (Expo) | Gratis |
| Apple Developer | 99 USD/año (solo para publicar en App Store/TestFlight) |
| Google Play | 25 USD pago único |
| Dominio (opcional, para política de privacidad) | ~12 USD/año |

Uso privado de 2 personas: **~0–40 USD/mes** según el plan y el modelo de IA. Si se publicara al público, el costo escala con la IA, que es el rubro dominante; se mitigaría con cuotas por usuario.

## 6. Integraciones y APIs

1. Supabase (Auth, DB, Storage, Functions, Cron).
2. API del modelo de IA (visión + texto) — clave como *secret* de Edge Functions.
3. Expo Push API.
4. Base de datos nutricional para contrastar estimaciones (opcional, Etapa 2): Open Food Facts (gratuita) o USDA FoodData Central.
5. Futuro: Apple HealthKit, Google Health Connect.
6. Datos de interacciones de suplementos: no existe una API gratuita fiable; se empezará con una base curada y conservadora y siempre con aviso de consultar a un profesional.

## 7. Etapas

**Etapa 1 (hecha)**: arquitectura · identidad visual · registro/login · evaluación inicial y perfiles · vinculación de pareja y consentimientos · dashboard base.
**Etapa 2 (hecha)**: entrenador IA · nutricionista IA · foto de comida con análisis · suplementos · recordatorios push · agua.
**Etapa 3**: retos y rachas · estadísticas · sueño · asistente de chat · pruebas de seguridad (RLS, penetración básica) · integración de salud.

## 8. Riesgos

| Riesgo | Mitigación |
|---|---|
| Datos de salud sensibles | RLS estricta, consentimiento explícito, exportar/eliminar, mínimo de datos a la IA |
| Estimación calórica por foto imprecisa | Rango de incertidumbre, corrección manual, nunca presentar como exacto |
| Consejo médico/nutricional inadecuado de la IA | Prompts con límites, sin dietas extremas (piso calórico), sin prescribir suplementos, derivar a profesionales |
| Trastornos alimentarios (registro obligatorio con foto puede ser dañino) | Opción de incidencia sin foto, tono no punitivo, rachas sin penalización por descanso/enfermedad, opción de ocultar calorías |
| Fuga de claves | Solo `anon key` en la app; secretas en Edge Functions |
| Fuerza bruta sobre códigos de invitación | Hash, caducidad, un uso, límite de intentos por usuario |
| Notificaciones en iOS/Android restringidas | Pedir permiso con contexto; fallback in-app |
| Costos de IA | Cuotas y caché por usuario |
| Cumplimiento (RGPD/leyes locales de datos de salud) | Política de privacidad, base legal por consentimiento, borrado completo |
| Salud no es un dispositivo médico | Avisos claros; la app no diagnostica |
