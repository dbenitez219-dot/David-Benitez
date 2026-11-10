import { execSync } from "node:child_process";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://zentra:zentra_dev@localhost:5432/zentra_test";
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.META_APP_ID = "123456";
process.env.META_APP_SECRET = "test_app_secret";
process.env.APP_URL = "http://localhost:3000";

// Aplica las migraciones a la base de pruebas (una vez por proceso).
execSync("npx prisma migrate deploy", { stdio: "ignore", env: process.env });
