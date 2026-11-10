import { hash, verify } from "@node-rs/argon2";

// argon2id con parámetros recomendados por OWASP (19 MiB, 2 iteraciones).
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (p: string) => hash(p, OPTS);
export const verifyPassword = (h: string, p: string) => verify(h, p).catch(() => false);
