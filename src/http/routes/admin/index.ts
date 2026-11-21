import { Router, type RequestHandler } from 'express';
import { DUMMY_HASH, verifyPassword } from '../../../services/password.js';
import type { AppContext } from '../../context.js';
import {
  destroySession,
  regenerateSession,
  requireAuth,
  requireRole,
  safeRedirectTarget,
  saveSession,
} from '../../middleware/auth.js';
import { renderPage } from '../../render.js';
import { loginSchema } from '../../validation.js';
import { accountRouter } from './account.js';
import { contentRouter } from './content.js';
import { operationsRouter } from './operations.js';
import { systemRouter } from './system.js';
import { usersRouter } from './users.js';

export const SESSION_COOKIE = 'lsc.sid';

/** El panel nunca debe quedar en cachés compartidas ni indexarse. */
const privatePage: RequestHandler = (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('X-Robots-Tag', 'noindex, nofollow');
  next();
};

/**
 * Panel de administración.
 * - STAFF: operaciones diarias (citas, cotizaciones, mensajes) y su cuenta.
 * - ADMIN: además, contenido del sitio, usuarios y estado del sistema.
 */
export function adminRouter(ctx: AppContext): Router {
  const router = Router();
  const { repos } = ctx;
  router.use(privatePage);

  // ──────────────────────────────── Sesión ────────────────────────────────

  router.get('/login', async (req, res) => {
    if (req.session.userId) return res.redirect(303, '/admin');
    await renderPage(res, 'admin/login', {
      title: 'Acceso al panel',
      layout: 'admin/layout',
      next: safeRedirectTarget(req.query.next),
      noindex: true,
    });
  });

  router.post('/login', ctx.limiters.login, async (req, res) => {
    const next = safeRedirectTarget((req.body as Record<string, unknown>).next);
    const parsed = loginSchema.safeParse(req.body);
    const user = parsed.success ? await repos.users.findByUsername(parsed.data.username) : null;
    // Se verifica siempre una contraseña (aunque el usuario no exista) para no revelar
    // por el tiempo de respuesta qué usuarios son válidos.
    const valid = await verifyPassword(
      parsed.success ? parsed.data.password : '',
      user?.passwordHash ?? DUMMY_HASH,
    );

    if (!parsed.success || !user || !user.isActive || !valid) {
      await repos.audit.write({
        action: 'LOGIN_FAILED',
        entityType: 'USER',
        entityId: user?.id,
        metadata: { username: parsed.success ? parsed.data.username.toLowerCase() : null },
      });
      await renderPage(
        res,
        'admin/login',
        {
          title: 'Acceso al panel',
          layout: 'admin/layout',
          next,
          error: 'Usuario o contraseña incorrectos.',
          username: parsed.success ? parsed.data.username : '',
          noindex: true,
        },
        401,
      );
      return;
    }

    // Nueva sesión tras autenticarse: evita la fijación de sesión.
    await regenerateSession(req);
    req.session.userId = user.id;
    await saveSession(req);
    await repos.users.recordLogin(user.id);
    await repos.audit.write({
      action: 'LOGIN',
      entityType: 'USER',
      entityId: user.id,
      userId: user.id,
    });
    res.redirect(303, next);
  });

  router.post('/logout', async (req, res) => {
    const userId = req.session.userId;
    if (userId) {
      await repos.audit.write({ action: 'LOGOUT', entityType: 'USER', entityId: userId, userId });
    }
    await destroySession(req);
    res.clearCookie(SESSION_COOKIE);
    res.redirect(303, '/admin/login');
  });

  // ─────────────────────────────── Secciones ───────────────────────────────

  router.use(requireAuth(repos.users));
  router.use(accountRouter(ctx));
  router.use(operationsRouter(ctx));
  router.use('/contenido', requireRole('ADMIN'), contentRouter(ctx));
  router.use('/usuarios', requireRole('ADMIN'), usersRouter(ctx));
  router.use('/sistema', requireRole('ADMIN'), systemRouter(ctx));

  return router;
}
