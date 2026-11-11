# Fase 7 — Globalización: países, idiomas, monedas y formatos regionales

## Qué hay
- **Selector de país** con buscador (nombre sin acentos, código ISO o prefijo `+595`) y **banderas**: 240+ países con nombre en el idioma del usuario (`Intl.DisplayNames`). Se usa en el registro y en Ajustes regionales.
- **Teléfonos internacionales**: prefijo del país + número, **validado según las reglas reales del país** (libphonenumber de Google); acepta formato nacional o internacional y guarda E.164. Opcional, pero si se escribe debe ser válido. Un teléfono puede ser de un país distinto al de residencia.
- **Registro internacional**: país obligatorio (lo elige la persona), idioma actual, y **moneda y zona horaria sugeridas** según el país (editables). No está limitado a Paraguay.
- **Idioma** seleccionable: español (inicial), inglés y portugués. Selector en la portada, el registro y la barra lateral; se guarda en el perfil. `<html lang>` acorde.
- **Moneda**: se elige la moneda de las cuentas publicitarias de la organización (sugerida por país). **No se convierte nada**: debe coincidir con la moneda en la que Meta informa el gasto. Los **precios de los planes son independientes por país/moneda** (panel admin, Fase 6).
- **Zona horaria** configurable (usuario y organización); la de la organización rige el horario de las automatizaciones. Para países con varias zonas se sugiere la principal (no la primera alfabética).
- **Formatos locales** de números, monedas y fechas según idioma + país (`es-PY`, `es-MX`, `en-US`, `pt-BR`…). Fechas de calendario (datos por día) se muestran en UTC para que un día no se corra; los instantes (pagos, avisos) en la zona horaria del usuario.
- **Ajustes regionales** (`/settings/regional`): preferencias personales y datos de la organización (solo administradores).

## Reglas de decisión (cumple "no usar la IP como único criterio")
El idioma se decide así: **preferencia guardada del usuario > cookie del selector > español**. **No se deduce de la IP ni de la ubicación.** El país, la moneda y la zona horaria los elige la persona y se pueden cambiar manualmente en cualquier momento.

## Cobertura de traducción (honesta)
Traducido a inglés y portugués (diccionario único `src/lib/i18n/dictionary.ts`, con prueba de paridad): **portada y planes, registro e inicio de sesión, barra lateral y avisos globales, panel, biblioteca de anuncios, filtros, Plan y pagos y Ajustes regionales.** ZENTRA AI **responde en el idioma elegido** (modo IA).

**Siguen solo en español** (hoy): checkout y pago simulado, comparador de anuncios, recomendaciones, asistente (pantalla y respuestas del modo por reglas), automatizaciones, notificaciones y los textos que generan (avisos, correos), conexiones, ventas, criterios de análisis, panel administrador y mensajes de error del servidor. Si una clave falta, la interfaz cae al español (nunca muestra una clave rota). Las cifras y fechas de **todas** las pantallas autenticadas ya usan el formato regional del usuario.

## Cómo ampliar
- **Nuevo país**: no requiere código. Definir sus precios en `/admin/plans` (sin precio, el plan no se puede pagar allí) y, para cobrar, un proveedor de pago que opere en ese país (`providers/index.ts`). Nombre, bandera, prefijo, moneda y zona se derivan automáticamente.
- **Nuevo idioma**: agregar la columna al diccionario (`Row`), el código a `LOCALES`/`IDX` en `src/lib/i18n/index.ts` y el nombre a `LOCALE_NAMES`. La prueba de paridad marca lo que falte.
- **Traducir una pantalla pendiente**: reemplazar sus textos por `t("clave")` (servidor: `getRegional()`), agregando las 3 traducciones al diccionario. Una prueba verifica que toda clave usada exista.

## Despliegue
Las banderas (SVG, paquete `country-flag-icons`, MIT) se copian a `public/flags` en `postinstall` y antes de `build` (`scripts/copy-flags.mjs`); no se suben al repositorio. Asegura que el despliegue ejecute `npm ci`/`npm install` con scripts habilitados o `npm run build`.

## Límites conocidos
- Las traducciones al inglés y portugués las escribí yo; conviene que un hablante nativo las revise antes del lanzamiento.
- Países sin datos de localización propios en Intl usan el formato del idioma por defecto.
- La zona horaria sugerida para países con varias zonas es la principal; el usuario debe confirmarla si vive en otra.
- Impuestos y facturación legal por país siguen pendientes (ver `docs/07-NEGOCIO.md`).

## Qué necesitas tú
Nada técnico. Recomendado: **revisión de las traducciones por hablantes nativos** (inglés y portugués) y decidir en qué países empiezas a vender para definir sus precios, impuestos y proveedor de pago.
