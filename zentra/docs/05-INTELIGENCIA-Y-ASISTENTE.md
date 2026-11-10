# Fase 4 — Inteligencia: análisis, recomendaciones y ZENTRA AI

## Qué hay
- **Criterios por cliente** (`/settings/analysis`, tabla `AnalysisSettings`): gasto/días/impresiones mínimos, costo máximo aceptable por resultado (mensajes, leads, ventas), frecuencia máxima y umbral de gasto inusual. Valores iniciales prudentes según la moneda.
- **Motor de clasificación** (`src/server/analytics/classify.ts`): referencia = costo objetivo del cliente o, si no lo definió, la mediana de sus anuncios del mismo objetivo. Cada clasificación trae su **motivo** y, si faltan datos, **qué falta**. Nunca juzga con datos insuficientes.
- **Recomendaciones** (`/recommendations`): considerar pausar, observar, anuncio ganador, cansancio de audiencia, gasto inusual y «aún no hay datos». Cada una trae evidencia etiquetada **comprobado** (de la plataforma) o **estimación** (cálculo de ZENTRA). Solo recomiendan: no ejecutan nada.
- **ZENTRA AI** (`/assistant`): pregunta en lenguaje natural sobre tus datos reales.

## Dos modos del asistente
| Modo | Cuándo | Qué hace |
|---|---|---|
| **IA** | Si `ANTHROPIC_API_KEY` está configurada | Claude usa 4 herramientas de solo lectura (`get_account_summary`, `list_ads`, `list_campaigns`, `get_recommendations`) y redacta la respuesta. Modelo por defecto `claude-opus-5-5`; cámbialo con `ANTHROPIC_MODEL` (p. ej. uno más económico). |
| **Reglas** | Sin clave, o si la API falla | Responde las 8 preguntas frecuentes con reglas sobre las **mismas herramientas** y lo dice en pantalla. Ante algo que no entiende, no inventa: lista lo que sí puede responder. |

## Garantías (y cómo se verifican)
- **No inventa datos**: el prompt exige usar herramientas y decir cuándo faltan datos; las cifras del modo reglas salen directamente de las consultas (hay una prueba que compara con el resumen real).
- **Comprobado / estimación / recomendación**: etiquetado en cada respuesta.
- **Mensaje ≠ venta**: las herramientas lo recuerdan en cada resultado; el costo por «cliente» se aclara como costo por resultado hasta que exista el módulo comercial (Fase 6).
- **Verificable**: cada pregunta se guarda (`AssistantLog`) con la respuesta y los **datos exactos consultados**; la pantalla los muestra en «Ver datos consultados».
- **Aislamiento**: la organización la fija el servidor; ninguna herramienta acepta un id de organización (probado intentando suplantarlo).
- **Solo lectura**: no existe ninguna herramienta que modifique algo. Un nombre de anuncio con instrucciones maliciosas llega solo como dato dentro de `tool_result` (probado); el prompt ordena ignorarlas.
- **Límites de uso**: 20 preguntas/hora por usuario y 150/día por organización; pregunta ≤ 500 caracteres; máx. 6 pasos de herramientas por pregunta.

## Estado real / limitaciones
- **El modo IA no se probó contra la API real** (no hay clave): se probó con un cliente simulado (flujo de herramientas, rechazos, fallos, bucles). Se verificó que el código compila contra el SDK oficial `@anthropic-ai/sdk` 1.8.0.
- No se activó el parámetro de `fallbacks` ante rechazos del modelo (no pude probarlo); un rechazo se muestra como mensaje amable. Se puede añadir cuando haya clave.
- El asistente responde preguntas **sueltas** (sin memoria de la conversación): más barato y más fácil de auditar. Se puede ampliar.
- Con datos de Meta, las campañas de tráfico/interacción se tratan como «mensajes» (ver `docs/04-META-ADS.md`).
- Costo del modo IA: pago por uso a Anthropic (ver precios vigentes); se controla con el modelo elegido y los límites de arriba.

## Qué necesitas tú
Para activar el modo IA: crear una API key en console.anthropic.com y cargar `ANTHROPIC_API_KEY` (opcionalmente `ANTHROPIC_MODEL`) en el servidor.
