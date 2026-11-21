import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Db } from '../../db/client.js';
import { renderPage } from '../render.js';
import { PostgresRateLimitStore } from './rate-limit-store.js';

export interface Limiters {
  /** Formularios públicos: 5 envíos cada 10 minutos por IP. */
  form: RequestHandler;
  /** Login del panel: 10 intentos cada 15 minutos por IP. */
  login: RequestHandler;
  /** API pública: 60 peticiones por minuto por IP (responde JSON). */
  api: RequestHandler;
}

/**
 * Limitadores por IP con contadores compartidos en PostgreSQL, para que el
 * límite sea el mismo con una o con varias instancias de la app.
 */
export function createLimiters(db: Db, enabled: boolean): Limiters {
  const skip = () => !enabled;
  const common = { standardHeaders: 'draft-8', legacyHeaders: false, skip } as const;

  const htmlLimiter = (name: string, windowMinutes: number, limit: number) =>
    rateLimit({
      ...common,
      windowMs: windowMinutes * 60_000,
      limit,
      store: new PostgresRateLimitStore(db, name),
      handler: async (_req, res) => {
        await renderPage(
          res,
          'pages/error',
          {
            title: 'Demasiadas solicitudes',
            heading: 'Demasiadas solicitudes',
            message: `Has enviado varias solicitudes seguidas. Espera ${windowMinutes} minutos e inténtalo de nuevo.`,
            noindex: true,
          },
          429,
        );
      },
    });

  return {
    form: htmlLimiter('form', 10, 5),
    login: htmlLimiter('login', 15, 10),
    api: rateLimit({
      ...common,
      windowMs: 60_000,
      limit: 60,
      store: new PostgresRateLimitStore(db, 'api'),
      handler: (_req, res) => {
        res.status(429).json({ error: 'Demasiadas solicitudes. Inténtalo en un minuto.' });
      },
    }),
  };
}
