import nodemailer from 'nodemailer';
import type { Env } from '../config/env.js';

export interface Notification {
  subject: string;
  text: string;
  replyTo?: string;
}

export interface Notifier {
  notify(notification: Notification): Promise<void>;
}

/**
 * Envía avisos internos al equipo del taller. Si no hay SMTP configurado se
 * desactiva sin romper el flujo: el registro ya quedó guardado en la base de datos.
 */
export function createNotifier(env: Env): Notifier {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS || !env.MAIL_TO) {
    return {
      async notify(notification) {
        if (env.NODE_ENV === 'development') {
          console.info(`[correo desactivado] ${notification.subject}`);
        }
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
  const to = env.MAIL_TO;

  return {
    async notify({ subject, text, replyTo }) {
      await transporter.sendMail({ from, to, subject, text, ...(replyTo ? { replyTo } : {}) });
    },
  };
}
