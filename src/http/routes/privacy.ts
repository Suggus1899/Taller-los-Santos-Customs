import { Router, type Request } from 'express';
import { z } from 'zod';
import type { Env } from '../../config/env.js';
import { renderPage } from '../render.js';

export const CONSENT_COOKIE = 'lsc_consent';
const CONSENT_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;

export type ConsentDecision = 'granted' | 'denied';

export function readConsent(req: Request): ConsentDecision | null {
  const value: unknown = (req.cookies as Record<string, unknown> | undefined)?.[CONSENT_COOKIE];
  return value === 'granted' || value === 'denied' ? value : null;
}

const consentSchema = z.object({
  decision: z.enum(['granted', 'denied']),
  returnTo: z.string().optional(),
});

/** Solo rutas internas (evita redirecciones abiertas). */
function safeReturn(value: string | undefined): string {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\')
    ? value
    : '/';
}

/**
 * Política de privacidad y consentimiento de cookies de analítica.
 * Funciona sin JavaScript: el banner es un formulario que fija la cookie en el
 * servidor. Google Analytics solo se carga si la decisión es "granted".
 */
export function privacyRouter(env: Env): Router {
  const router = Router();

  router.get('/privacidad', async (_req, res) => {
    await renderPage(res, 'pages/privacy', {
      title: 'Política de privacidad',
      description: 'Qué datos recogemos, para qué los usamos y cuánto tiempo los conservamos.',
      retentionMonths: env.DATA_RETENTION_MONTHS,
    });
  });

  router.post('/privacidad/consentimiento', (req, res) => {
    const parsed = consentSchema.safeParse(req.body);
    const returnTo = safeReturn(parsed.success ? parsed.data.returnTo : undefined);
    if (parsed.success) {
      res.cookie(CONSENT_COOKIE, parsed.data.decision, {
        maxAge: CONSENT_MAX_AGE_MS,
        httpOnly: true,
        sameSite: 'lax',
        secure: env.NODE_ENV === 'production',
        path: '/',
      });
    }
    res.redirect(303, returnTo);
  });

  return router;
}
