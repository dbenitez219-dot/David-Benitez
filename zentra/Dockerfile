# ZENTRA — imagen de producción (multi-etapa). Construir:  docker build -t zentra .
FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY scripts/copy-flags.mjs scripts/copy-flags.mjs
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build   # copia banderas, genera el cliente de Prisma y compila Next (salida autónoma)

# Tarea única de migraciones de base de datos (se ejecuta antes de arrancar la app nueva)
FROM build AS migrate
CMD ["npx", "prisma", "migrate", "deploy"]

FROM base AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
RUN useradd --system --uid 1001 --create-home zentra
COPY --from=build --chown=zentra:zentra /app/.next/standalone ./
COPY --from=build --chown=zentra:zentra /app/.next/static ./.next/static
COPY --from=build --chown=zentra:zentra /app/public ./public
USER zentra
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
