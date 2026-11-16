# Puesta en marcha de VITARA (paso a paso)

Cada paso termina con algo que ves en pantalla para confirmar que salió bien. Si algo no coincide, pará y avisame antes de seguir.
**Nunca pegues claves ni contraseñas en el chat.** Solo contame qué ves.

## Fase 1 · Base de datos (Supabase) — 15 min

### Paso 1 · Crear el proyecto
1. Entrá a **supabase.com** → **Start your project** → iniciá sesión (podés usar tu cuenta de GitHub).
2. **New project**. Nombre: `vitara`. Elegí una contraseña de base de datos y **guardala en un lugar seguro** (no la vas a necesitar seguido). Región: la más cercana a vos (por ejemplo *South America (São Paulo)*).
3. Esperá 1–2 minutos. ✅ Ves el panel del proyecto.

### Paso 2 · Crear las tablas (4 archivos, en este orden)
Para cada archivo: menú izquierdo **SQL Editor** (`</>`) → **New query** → abrí el archivo, copiá **todo**, pegalo y tocá **Run**.
1. `vitara/supabase/migrations/0001_core.sql`
2. `vitara/supabase/migrations/0002_stage2.sql`
3. `vitara/supabase/migrations/0003_seed.sql`
4. `vitara/supabase/migrations/0004_meal_note.sql`

✅ Cada uno debe decir **Success**. Si uno da error, pará ahí y copiame el mensaje.

### Paso 3 · Permitir registro sin confirmar correo (solo para probar)
**Authentication** → **Sign In / Providers** (o *Providers*) → **Email** → apagá **Confirm email** → **Save**.
✅ Queda guardado.

### Paso 4 · Anotar las dos claves públicas
**Project Settings** (engranaje) → **API** (o *API Keys*). Anotá:
- **Project URL** (empieza con `https://` y termina en `.supabase.co`).
- La clave **anon** / **publishable** (la pública).
⚠️ **No uses ni compartas la clave `service_role` / `secret`.**

## Fase 2 · Probar la app en tu computadora — 20 min

### Paso 5 · Instalar lo necesario (una sola vez)
1. **Node.js** (versión LTS) desde **nodejs.org**. ✅ En una terminal, `node -v` muestra un número.
2. **Git** desde **git-scm.com** (si no lo tenés).

### Paso 6 · Bajar el proyecto
En una terminal:
```
git clone https://github.com/dbenitez219-dot/David-Benitez.git
cd David-Benitez
git checkout claude/vitara-wellness-app-wmg7v6
cd vitara/app
```

### Paso 7 · Poner tus claves
1. Copiá el archivo de ejemplo: `cp .env.example .env` (en Windows: `copy .env.example .env`).
2. Abrí `.env` con el Bloc de notas y reemplazá los dos valores por tu **Project URL** y tu clave **anon** del Paso 4. Guardá.

### Paso 8 · Arrancar
```
npm install --legacy-peer-deps
npx expo start
```
Cuando aparezca el menú, apretá **w** (se abre en el navegador). ✅ Ves la pantalla de VITARA con «Iniciar sesión».

### Paso 9 · Probar lo básico
1. **Crear cuenta** (nombre, correo, contraseña de 8+ caracteres, aceptar la política). ✅ Te lleva a la evaluación.
2. Completá los 6 pasos. ✅ Llegás a «Hoy» con tu nombre.
3. Abrí una **ventana privada** del navegador con la misma dirección y creá la **segunda cuenta** (la de tu pareja).
4. En la cuenta 1: pestaña **Pareja** → **Generar mi código**. En la cuenta 2: **Tengo un código** → pegá el código → **Vincular**. ✅ Las dos muestran «Vinculado con …».
5. Probá en «Hoy»: **+250 ml** de agua. ✅ Sube la barra.
6. Probá **Suplementos** (agregá «Creatina»). ✅ Aparecen información y avisos.

Hasta acá se prueba todo **sin IA**. Contame qué anduvo y qué no.

## Fase 3 · Activar la inteligencia artificial — 25 min

### Paso 10 · Cuenta y clave de IA
1. Entrá a **console.anthropic.com** y creá una cuenta (es **distinta** de tu suscripción de Claude).
2. **Billing** → cargá saldo (con **5 USD** alcanza para empezar; poné un límite mensual bajo).
3. **API Keys** → **Create Key** → copiala (empieza con `sk-ant-`). **No la pegues en el chat.**

### Paso 11 · Conectar la terminal con Supabase
Desde la carpeta `David-Benitez/vitara`:
```
npx supabase login
npx supabase link --project-ref TU_REF
```
`TU_REF` es el código que está en la URL de tu proyecto (`https://TU_REF.supabase.co`). Te pide la contraseña de base de datos del Paso 1.

### Paso 12 · Guardar los secretos y publicar las funciones
```
npx supabase secrets set ANTHROPIC_API_KEY=tu-clave CRON_SECRET=una-frase-larga-y-aleatoria
npx supabase functions deploy generate-training-plan generate-nutrition-plan analyze-meal coach-chat send-reminders
```
✅ Cada función dice *Deployed*.

### Paso 13 · Probar la IA
En la app: **Entreno → Generar mi plan** (tarda ~1 minuto), luego **Comidas → Generar mi plan**.
✅ Aparecen tu semana de entrenamiento y tu menú. Probá una **comida con foto** y una **pregunta al entrenador** durante una sesión.

## Fase 4 · Recordatorios en el teléfono (opcional, después)
Requiere un build con Expo/EAS. Lo vemos juntos cuando lo anterior funcione.
