// Se ejecuta una vez al iniciar el servidor (Next.js). Valida el entorno y captura los errores de las solicitudes.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { validateEnv } = await import("./lib/env");
  const { log } = await import("./lib/monitor");
  const { errors, warnings } = validateEnv();
  for (const w of warnings) log.warn(w, { kind: "env" });
  if (errors.length) {
    for (const e of errors) log.error(e, { kind: "env" });
    if (process.env.NODE_ENV === "production") throw new Error(`Configuración inválida:\n- ${errors.join("\n- ")}`);
  }
}

export async function onRequestError(err: unknown, request: { path: string; method: string }, context: { routePath?: string; routeType?: string }) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportError } = await import("./lib/monitor");
  await reportError(err, { route: context.routePath ?? request.path, method: request.method, type: context.routeType });
}
