# VITARA — Personal Wellness AI

Asistente de entrenamiento, nutrición y hábitos para parejas. Expo (iOS/Android/Web) + Supabase.
Arquitectura, costos, integraciones y riesgos: [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).

> Vive en `vitara/` y es independiente de la app CristalAuto que está en la raíz del repositorio.

## Estado: Etapa 1 (base)
Hecho: registro/login · evaluación inicial (6 pasos, guardada en BD) · perfiles separados (datos básicos, salud, preferencias, medidas) ·
vinculación de pareja con código privado · consentimientos por categoría · dashboard base (solo datos reales) ·
exportar y eliminar datos · política de privacidad (borrador) · i18n preparado (español).
Pendiente (Etapas 2 y 3): entrenador, nutricionista, fotos de comida con IA, agua, suplementos, notificaciones, retos, sueño, chat, estadísticas.

## Puesta en marcha
1. Crear un proyecto en supabase.com (plan Free sirve para empezar).
2. SQL Editor → pegar y ejecutar `supabase/migrations/0001_core.sql`.
3. Authentication → Providers → Email activado (para probar rápido, se puede desactivar «Confirm email»).
4. `cd app && cp .env.example .env` y completar `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY` (Project Settings → API; **solo la clave anon**, nunca la service_role).
5. `npm install --legacy-peer-deps && npx expo start` (pulsar `w` para web, o escanear el QR con Expo Go).
6. Crear dos cuentas, y en una generar el código en la pestaña **Pareja** y canjearlo en la otra.

## Pruebas realizadas
- Migración ejecutada en PostgreSQL 16 con un simulacro de Supabase (`auth.uid()`, roles, storage): aislamiento RLS entre usuarios,
  alta automática de perfil, flujo de invitación (caducidad, un solo uso, minúsculas), límite de 5 intentos/hora, bloqueo de escritura
  directa en `couple_members`, consentimientos, desvinculación, exportación y borrado de cuenta.
- `tsc --noEmit` limpio y build web (`expo export`) correcto; pantallas de acceso verificadas en navegador.
- **Aún no probado**: contra un proyecto Supabase real ni en dispositivo físico. Hacerlo en el paso 6 anterior.
