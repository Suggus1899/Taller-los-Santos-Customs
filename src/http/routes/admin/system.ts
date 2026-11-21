import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import { currentUser } from '../../middleware/auth.js';
import { renderPage } from '../../render.js';
import { noticeFrom, withNotice } from './shared.js';

const jobId = z
  .string()
  .regex(/^\d{1,19}$/)
  .transform((v) => BigInt(v));

/** Estado del sistema: cola de trabajos y tasa del dólar (solo ADMIN). */
export function systemRouter(ctx: AppContext): Router {
  const router = Router();
  const { repos } = ctx;

  router.get('/', async (req, res) => {
    const [stats, failed] = await Promise.all([repos.jobs.stats(), repos.jobs.failed()]);
    await renderPage(res, 'admin/system', {
      title: 'Sistema',
      layout: 'admin/layout',
      section: 'sistema',
      stats,
      failed,
      rates: ctx.exchangeRates.peek(),
      flash: noticeFrom(req.query),
      noindex: true,
    });
  });

  router.post('/trabajos/:id/reintentar', async (req, res) => {
    const id = jobId.safeParse(req.params.id);
    const ok = id.success && (await repos.jobs.retry(id.data));
    if (ok && id.success) {
      await repos.audit.write({
        action: 'JOB_RETRIED',
        entityType: 'JOB',
        userId: currentUser(req).id,
        metadata: { jobId: id.data.toString() },
      });
    }
    res.redirect(
      303,
      withNotice(
        '/admin/sistema',
        ok ? 'Trabajo reencolado.' : 'El trabajo no existe o no está fallido.',
      ),
    );
  });

  return router;
}
