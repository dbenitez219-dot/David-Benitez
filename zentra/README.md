# ZENTRA — Tu publicidad. Más inteligente.

Plataforma SaaS de inteligencia artificial para publicidad. Estado: **Fase 1 (fundamentos)**.

## Requisitos
Node 22+, PostgreSQL 16 (o `docker compose up -d`).

## Puesta en marcha
```bash
cd zentra
cp .env.example .env        # completa ENCRYPTION_KEY: openssl rand -base64 32
npm install
npm run db:deploy && npm run db:seed
npm run dev                 # http://localhost:3000
npm test                    # requiere la BD "zentra_test" (ver tests/setup.ts)
```
Docs en `docs/`.
