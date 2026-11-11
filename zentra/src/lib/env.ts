/**
 * Validación de variables de entorno al arrancar. En producción, un error impide iniciar (mejor caer al desplegar
 * que fallar a medias con clientes); las advertencias describen funciones que quedan desactivadas.
 */
export type EnvReport = { errors: string[]; warnings: string[] };

export function validateEnv(env: Record<string, string | undefined> = process.env, production = env.NODE_ENV === "production"): EnvReport {
  const errors: string[] = [], warnings: string[] = [];
  const need = (k: string, why: string) => { if (!env[k]) errors.push(`${k} es obligatoria (${why}).`); };

  need("DATABASE_URL", "conexión a PostgreSQL");
  const key = env.ENCRYPTION_KEY;
  if (!key) errors.push("ENCRYPTION_KEY es obligatoria (cifra los tokens de Meta): genera una con `openssl rand -base64 32`.");
  else if (Buffer.from(key, "base64").length !== 32) errors.push("ENCRYPTION_KEY debe ser de exactamente 32 bytes en base64.");

  if (production) {
    if (!env.APP_URL || !/^https:\/\//.test(env.APP_URL)) errors.push("APP_URL debe ser una dirección https:// en producción (se usa para OAuth, webhooks y correos).");
    if (!env.CRON_SECRET || env.CRON_SECRET.length < 32) errors.push("CRON_SECRET debe tener al menos 32 caracteres en producción (protege las tareas programadas).");
    if (env.ALLOW_SIMULATED_PAYMENTS === "true") warnings.push("ALLOW_SIMULATED_PAYMENTS=true: en producción los pagos serán SIMULADOS (no cobran). Solo para demos.");
    if (!env.BILLING_WEBHOOK_SECRET || env.BILLING_WEBHOOK_SECRET.length < 32) warnings.push("BILLING_WEBHOOK_SECRET ausente o corto: los webhooks de pago no se podrán verificar.");
    if (!env.RESEND_API_KEY || !env.MAIL_FROM) warnings.push("Sin RESEND_API_KEY/MAIL_FROM: no se envían correos (restablecer contraseña, verificación y avisos NO funcionarán).");
    if (!env.ERROR_WEBHOOK_URL) warnings.push("Sin ERROR_WEBHOOK_URL: los errores solo quedarán en los registros del servidor (sin alertas).");
  }
  if (env.AUTOMATION_KILL_SWITCH === "true") warnings.push("AUTOMATION_KILL_SWITCH=true: TODAS las acciones sobre Meta están detenidas en la plataforma.");
  if (env.BILLING_KILL_SWITCH === "true") warnings.push("BILLING_KILL_SWITCH=true: los cobros, reintentos y vencimientos de suscripciones están CONGELADOS.");
  if (!env.META_APP_ID || !env.META_APP_SECRET) warnings.push("Sin META_APP_ID/META_APP_SECRET: la conexión con Meta Ads está desactivada.");
  if (!env.ANTHROPIC_API_KEY) warnings.push("Sin ANTHROPIC_API_KEY: ZENTRA AI responde con reglas básicas (sin IA).");
  return { errors, warnings };
}
