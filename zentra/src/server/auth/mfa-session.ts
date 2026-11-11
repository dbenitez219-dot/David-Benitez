import { db } from "@/lib/db";

/** Marca la sesión como verificada con el segundo factor. */
export const markMfaVerified = (sessionId: string) => db.session.update({ where: { id: sessionId }, data: { mfaVerifiedAt: new Date() } });
