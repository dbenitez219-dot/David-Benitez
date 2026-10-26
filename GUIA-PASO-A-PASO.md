# Puesta en marcha de CristalAuto (paso a paso)

Todo se hace con el correo `cristalauto95@gmail.com`. Cada paso termina con algo que ves en pantalla para confirmar que salió bien.

## Paso A · Crear las tablas (Supabase)
1. Entrá a **supabase.com** → tu proyecto `cristalauto`.
2. Menú izquierdo: **SQL Editor** (ícono `</>`) → **New query** (Nueva consulta).
3. Abrí el archivo `supabase/01-tablas.sql`, copiá **todo** y pegalo. Tocá **Run** (Ejecutar).
4. ✅ Debe decir **Success. No rows returned**.

## Paso B · Crear el usuario para entrar a la app
1. Menú izquierdo: **Authentication** → **Users** → **Add user** → **Create new user**.
2. Correo: `cristalauto95@gmail.com` · Contraseña: una que recuerden los dos (guardala en un lugar seguro).
3. Marcá **Auto Confirm User** (Confirmar usuario automáticamente) y creá el usuario.
4. ✅ Aparece en la lista.

## Paso C · Publicar la función que envía los avisos
1. Menú izquierdo: **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Nombre: `cristalauto` (en minúscula). Si tu función quedó con otro nombre, ese nombre exacto va en `config.js` (campo `fn`) y en `supabase/02-avisos.sql`.
3. Borrá el código de ejemplo, abrí `supabase/functions/cristalauto/index.ts`, copiá **todo** y pegalo.
4. Tocá **Deploy function**.
5. **Importante:** en la configuración de la función apagá **Verify JWT** / **Enforce JWT Verification** (la función hace su propia verificación). Guardá.
6. ✅ La función aparece como *Active*.

## Paso D · Clave del servicio de correos (Resend)
1. En **resend.com** → **API Keys** → **Create API Key** (permiso *Sending access*). Copiala (empieza con `re_`).
2. En Supabase: **Edge Functions** → **Secrets** (Manage secrets) → **Add new secret**.
   - Nombre: `RESEND_API_KEY` · Valor: la clave que copiaste. Guardá.
3. ✅ El secreto aparece en la lista. **Esa clave no se comparte con nadie ni se pega en chats.**

## Paso E · Activar el programador de avisos
1. **SQL Editor** → **New query** → pegá todo `supabase/02-avisos.sql` → **Run**.
2. ✅ Success. (Si pide activar extensiones `pg_cron` / `pg_net`, en **Database → Extensions** activalas y volvé a ejecutar.)

## Paso F · Publicar la app (Netlify) e instalarla
1. En **netlify.com** → **Add new site** → **Import an existing project** → GitHub → repositorio `David-Benitez`.
2. Rama a publicar: la que te indique Claude. *Build command*: dejar vacío · *Publish directory*: `.` (punto).
3. Cuando termine, Netlify te da una dirección `https://…netlify.app`. Abrila.
4. **iPhone:** abrila en **Safari** → botón Compartir → **Agregar a pantalla de inicio**. Abrí la app desde ese ícono.
5. **Computadora:** en Chrome o Edge, ícono de instalar en la barra de direcciones (opcional).
6. Iniciá sesión con el correo y la contraseña del Paso B.

## Paso G · Activar avisos en el teléfono
1. En la app (abierta desde el ícono): **Ajustes → Activar avisos en este dispositivo** → aceptar el permiso.
2. **Ajustes → Enviar aviso de prueba**. ✅ Debe llegar un correo a `cristalauto95@gmail.com` y una notificación al teléfono.
3. Repetí en el otro teléfono y en la computadora.

## Cargar tus datos
- **Ajustes → Importar inventario**: subí tu Excel de stock (elegí la hoja más actualizada).
- **Ajustes → Servicios y precios**: revisá los precios. **Proveedores**: cargá tus proveedores fijos.
- **Ajustes → Empresa**: RUC, timbrado y colocadores.

## Cuándo llegan los avisos
| Aviso | Cuándo |
|---|---|
| Correo + notificación por venta | Al registrar cada venta |
| Recordatorio de colocación | 1 hora antes de la hora agendada |
| Aviso de la mañana (créditos por vencer en 5 días, stock bajo, colocaciones y consultas del día) | 07:30 (hora de Paraguay) |
| Resumen del día | 20:00 (hora de Paraguay) |

## Paso H · Activar el Asistente 🤖 (escribís o dictás, vos confirmás)
1. **Claude Console** (platform.claude.com): crear cuenta → **Billing** → cargar crédito chico (unos 10 USD) → poner un **límite de gasto mensual**.
2. **API Keys** → crear una clave. **No la pegues en el chat con nadie**: se copia directo en el paso 3.
3. Supabase → **Edge Functions → Secrets** → agregar `ANTHROPIC_API_KEY` = la clave.
4. Supabase → **Edge Functions → Deploy a new function** → nombre exacto **`asistente`** (minúsculas) → pegar el contenido de `supabase/functions/asistente/index.ts` → **desactivar “Verify JWT”** → Deploy.
5. Subir de nuevo la app a Netlify (el ZIP `publicar/CristalAuto.zip`).
6. En la app: pestaña **Asistente** → escribir, por ejemplo: *“vendí un parabrisas Vitz 2008 a Juan, 900 mil, efectivo”*. En el iPhone podés dictar con el 🎤 del teclado.
7. El asistente te muestra una tarjeta con lo que va a guardar: **Confirmar** o **Descartar**. Sin tu confirmación no se guarda nada.
