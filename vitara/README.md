# VITARA — Personal Wellness AI

Asistente de entrenamiento, nutrición y hábitos para parejas. Expo (iOS/Android/Web) + Supabase.
Arquitectura, costos, integraciones y riesgos: [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).

> Vive en `vitara/` y es independiente de la app CristalAuto que está en la raíz del repositorio.

## Estado
**Etapa 1 (hecha):** registro/login · evaluación inicial · perfiles separados · pareja con código privado y consentimientos · exportar/eliminar datos · i18n (español).
**Etapa 2 (hecha, ver «Pruebas»):**
- **Entrenador:** plan semanal generado por IA a partir de tu evaluación, usando solo ejercicios del catálogo (52, con técnica paso a paso) que tu equipamiento permite; sesión con registro de peso/reps por serie, ejercicio completado, sustitución de ejercicios (y «no volver a incluirlo»), calentamiento/vuelta a la calma, sugerencia de progresión de cargas (regla determinista) y chat con el entrenador.
- **Nutricionista:** metas calculadas por código (piso calórico de seguridad, sin déficit para menores o bajo peso) y menú de 7 días por IA con recetas, lista de compras y sustituciones; se descartan platos con tus alergias.
- **Comidas con foto:** foto obligatoria (la base de datos rechaza un registro sin foto). Para ahorrar costo, la IA **no** analiza la foto por defecto: se guarda con una descripción y/o alimentos cargados a mano. El análisis por IA (con rango de incertidumbre) es un botón opcional, con tope de 8 por día. Incidencia justificada si no se pudo fotografiar. Aprende tus alimentos reales.
- **Agua**, **suplementos** (dosis, horarios, tomas, historial, avisos conservadores según tu medicación/condiciones) y **recordatorios push** configurables (pausar, horarios, categorías).
**Pendiente (Etapa 3):** retos y rachas, estadísticas, sueño, asistente general, avisos de pareja/logros, pruebas de seguridad, imágenes/videos de ejercicios.

## Puesta en marcha
1. Crear un proyecto en supabase.com (plan Free sirve para empezar).
2. SQL Editor → pegar y ejecutar `supabase/migrations/0001_core.sql`.
3. Authentication → Providers → Email activado (para probar rápido, se puede desactivar «Confirm email»).
4. `cd app && cp .env.example .env` y completar `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY` (Project Settings → API; **solo la clave anon**, nunca la service_role).
5. `npm install --legacy-peer-deps && npx expo start` (pulsar `w` para web, o escanear el QR con Expo Go).
6. Crear dos cuentas, y en una generar el código en la pestaña **Pareja** y canjearlo en la otra.

## Etapa 2: despliegue de la IA y los recordatorios
1. SQL Editor: ejecutar en orden `0002_stage2.sql`, `0003_seed.sql` y `0004_meal_note.sql` (después de `0001`).
2. Instalar el CLI de Supabase y, desde `vitara/`: `supabase link --project-ref TU_REF`.
3. Secrets (nunca en la app): `supabase secrets set ANTHROPIC_API_KEY=... CRON_SECRET=un-valor-largo-y-aleatorio`
   (modelos por tarea, opcionales: `MODEL_PLANS` = `claude-opus-5-5` para planes, `MODEL_CHAT` = `claude-sonnet-5-5` para el chat, `MODEL_MEAL` = `claude-sonnet-5-5` para fotos; con reintento automático si un filtro de seguridad rechaza la petición).
4. `supabase functions deploy generate-training-plan generate-nutrition-plan analyze-meal coach-chat send-reminders`
   (`supabase/config.toml` desactiva la verificación JWT solo en `send-reminders`, que se protege con `CRON_SECRET`).
5. Recordatorios: en `supabase/cron.sql` reemplazar la URL y el secreto y ejecutarlo en el SQL Editor (activa `pg_cron` y `pg_net`).
6. Notificaciones en el teléfono: requieren un build con EAS (`eas init` para el `projectId`) o Expo Go en iOS; no funcionan en web.
7. En la app: Entreno → «Generar mi plan»; Comidas → «Generar mi plan»; probar una comida con foto.

## Pruebas realizadas
- **Base de datos** (PostgreSQL 16 con simulacro de Supabase): migraciones 0001–0003 y 16 comprobaciones de la Etapa 2 — foto obligatoria o incidencia justificada, foto solo en tu carpeta, una comida por tipo y día, aislamiento total entre usuarios, el cliente no puede crear planes ni tocar el consumo de IA, catálogo de solo lectura, cascada al borrar la cuenta; y las de la Etapa 1 (pareja, intentos, consentimientos).
- **Lógica** (`node --experimental-strip-types tests/<archivo>.test.ts`): `safety` (metas con pisos de seguridad, validación de planes y de análisis de fotos, alérgenos), `reminders` (zonas horarias, ventanas, pausas), `app-logic` (progresión, avisos de suplementos, cálculos).
- Edge Functions: verificación de tipos con TypeScript contra el SDK de Supabase y de Anthropic. App: `tsc` limpio y build web correcto.
- **No probado todavía:** las Edge Functions contra la API real de IA, el análisis de fotos reales, las notificaciones en un teléfono, ni la app contra un proyecto Supabase real. Hacerlo con los pasos de arriba.
- Límites conocidos: el plan nutricional completo puede tardar 1–2 minutos (si tu plan de Supabase corta antes, bajar el esfuerzo o dividir la generación); sin imágenes/videos de ejercicios todavía (`exercises.media_url` está listo); la zona horaria define el país para sugerir alimentos (aún no se pregunta el país).
