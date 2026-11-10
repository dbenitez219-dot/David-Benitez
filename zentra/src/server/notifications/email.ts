/** Correo electrónico (preparado). Sin RESEND_API_KEY no se envía nada. WhatsApp: futura integración oficial. */
export type Mailer = { send(to: string[], subject: string, text: string): Promise<void> };

let override: Mailer | null | undefined;
/** Solo para pruebas. */
export const setMailerForTests = (m: Mailer | null | undefined) => { override = m; };

export function defaultMailer(): Mailer | null {
  if (override !== undefined) return override;
  const key = process.env.RESEND_API_KEY, from = process.env.MAIL_FROM;
  if (!key || !from) return null;
  return {
    async send(to, subject, text) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST", headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ from, to, subject, text }),
      });
      if (!res.ok) throw new Error(`Resend respondió ${res.status}`);
    },
  };
}
