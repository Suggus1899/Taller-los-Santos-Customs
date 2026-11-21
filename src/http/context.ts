import type { Env } from '../config/env.js';
import type { Repositories } from '../repositories/index.js';
import type { ExchangeRateService } from '../services/exchange-rate.js';
import type { Notifier } from '../services/mailer.js';

/** Dependencias que reciben las rutas. Se inyectan para poder sustituirlas en los tests. */
export interface AppContext {
  env: Env;
  repos: Repositories;
  notifier: Notifier;
  exchangeRates: ExchangeRateService;
  /** Permite desactivar los límites de peticiones en los tests. */
  rateLimit: boolean;
}

/** Lanza la notificación sin bloquear la respuesta ni romperla si el correo falla. */
export function notifyInBackground(
  ctx: AppContext,
  subject: string,
  text: string,
  replyTo?: string,
) {
  ctx.notifier
    .notify({ subject, text, ...(replyTo ? { replyTo } : {}) })
    .catch((error: unknown) => console.error('No se pudo enviar la notificación:', error));
}
