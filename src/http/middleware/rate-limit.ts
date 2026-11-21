import { rateLimit } from 'express-rate-limit';
import { renderPage } from '../render.js';

/**
 * Límites por IP. El almacén en memoria sirve para una sola instancia; si la app
 * se escala horizontalmente, hay que usar un almacén compartido (p. ej. Redis).
 */
function limiter(windowMinutes: number, limit: number, skip?: () => boolean) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    ...(skip ? { skip } : {}),
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
}

/** Formularios públicos: 5 envíos cada 10 minutos por IP. */
export const formLimiter = (skip?: () => boolean) => limiter(10, 5, skip);

/** Login del panel: 10 intentos cada 15 minutos por IP. */
export const loginLimiter = (skip?: () => boolean) => limiter(15, 10, skip);
