import nodemailer from 'nodemailer';
import type { Env } from '../config/env.js';
import { logger } from '../lib/logger.js';

export interface Email {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}

export interface Mailer {
  /** Devuelve 'skipped' si el correo no está configurado (no es un error). */
  send(email: Email): Promise<'sent' | 'skipped'>;
  /** Destinatarios internos (MAIL_TO), o null si no hay. */
  readonly staffRecipients: string | null;
}

/**
 * Envío de correo por SMTP. Solo lo usa el worker: la web nunca envía correos
 * directamente, encola trabajos `email.send` (ver src/jobs).
 */
export function createMailer(env: Env): Mailer {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    return {
      staffRecipients: env.MAIL_TO ?? null,
      async send(email) {
        logger.info({ subject: email.subject }, 'correo omitido: SMTP no configurado');
        return 'skipped';
      },
    };
  }

  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  const from = env.MAIL_FROM ?? env.SMTP_USER;

  return {
    staffRecipients: env.MAIL_TO ?? null,
    async send({ to, subject, text, replyTo }) {
      await transporter.sendMail({ from, to, subject, text, ...(replyTo ? { replyTo } : {}) });
      return 'sent';
    },
  };
}
