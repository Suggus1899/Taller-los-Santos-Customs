import { Router } from 'express';
import type { Db } from '../../db/client.js';

/**
 * Sondas para el orquestador (Docker, Kubernetes, Render…):
 * - /healthz (liveness): el proceso responde. No toca dependencias externas,
 *   para que un fallo de la BD no provoque reinicios en cadena.
 * - /readyz (readiness): puede atender tráfico porque la BD responde.
 */
export function healthRouter(db: Db): Router {
  const router = Router();

  router.get('/healthz', (_req, res) => {
    res.set('Cache-Control', 'no-store').json({ status: 'ok' });
  });

  router.get('/readyz', async (_req, res) => {
    try {
      await db.$queryRaw`SELECT 1`;
      res.set('Cache-Control', 'no-store').json({ status: 'ready' });
    } catch {
      res.status(503).set('Cache-Control', 'no-store').json({ status: 'unavailable' });
    }
  });

  return router;
}
