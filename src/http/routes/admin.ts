import { Router, type Request, type RequestHandler } from 'express';
import { z } from 'zod';
import { appointmentStatuses, SlotTakenError } from '../../repositories/appointments.js';
import { messageStatuses } from '../../repositories/messages.js';
import { quoteStatuses } from '../../repositories/quotes.js';
import { DUMMY_HASH, verifyPassword } from '../../services/password.js';
import type { AppContext } from '../context.js';
import {
  destroySession,
  regenerateSession,
  requireAuth,
  safeRedirectTarget,
  saveSession,
} from '../middleware/auth.js';
import { loginLimiter } from '../middleware/rate-limit.js';
import { renderPage } from '../render.js';
import { loginSchema } from '../validation.js';

export const SESSION_COOKIE = 'lsc.sid';

const tabs = ['citas', 'cotizaciones', 'mensajes'] as const;
type Tab = (typeof tabs)[number];

const idParam = z.coerce.number().int().positive();

/** Id del usuario autenticado (las rutas que lo usan van después de requireAuth). */
function currentUserId(req: Request): number {
  const id = req.session.user?.id;
  if (id === undefined) throw Object.assign(new Error('Sesión requerida'), { status: 401 });
  return id;
}

/** El panel nunca debe quedar en cachés compartidas ni indexarse. */
const privatePage: RequestHandler = (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('X-Robots-Tag', 'noindex, nofollow');
  next();
};

export function adminRouter(ctx: AppContext): Router {
  const router = Router();
  const { repos } = ctx;
  router.use(privatePage);

  // ──────────────────────────────── Sesión ────────────────────────────────

  router.get('/login', async (req, res) => {
    if (req.session.user) return res.redirect(303, '/admin');
    await renderPage(res, 'admin/login', {
      title: 'Acceso al panel',
      layout: 'admin/layout',
      next: safeRedirectTarget(req.query.next),
      noindex: true,
    });
  });

  router.post(
    '/login',
    loginLimiter(() => !ctx.rateLimit),
    async (req, res) => {
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
      req.session.user = { id: user.id, username: user.username, role: user.role };
      await saveSession(req);
      await repos.users.recordLogin(user.id);
      await repos.audit.write({
        action: 'LOGIN',
        entityType: 'USER',
        entityId: user.id,
        userId: user.id,
      });
      res.redirect(303, next);
    },
  );

  router.post('/logout', async (req, res) => {
    const user = req.session.user;
    if (user) {
      await repos.audit.write({
        action: 'LOGOUT',
        entityType: 'USER',
        entityId: user.id,
        userId: user.id,
      });
    }
    await destroySession(req);
    res.clearCookie(SESSION_COOKIE);
    res.redirect(303, '/admin/login');
  });

  // ─────────────────────────────── Panel ────────────────────────────────

  router.use(requireAuth);

  router.get('/', async (req, res) => {
    const tab: Tab = tabs.includes(req.query.tab as Tab) ? (req.query.tab as Tab) : 'citas';
    const filter = typeof req.query.estado === 'string' ? req.query.estado : '';

    const [pendingAppointments, newQuotes, newMessages] = await Promise.all([
      repos.appointments.countByStatus('PENDING'),
      repos.quotes.countByStatus('NEW'),
      repos.messages.countByStatus('NEW'),
    ]);

    let rows: unknown[];
    let statuses: readonly string[];
    if (tab === 'citas') {
      statuses = appointmentStatuses;
      rows = await repos.appointments.list(appointmentStatuses.find((s) => s === filter));
    } else if (tab === 'cotizaciones') {
      statuses = quoteStatuses;
      rows = await repos.quotes.list(quoteStatuses.find((s) => s === filter));
    } else {
      statuses = messageStatuses;
      rows = await repos.messages.list(messageStatuses.find((s) => s === filter));
    }

    await renderPage(res, 'admin/dashboard', {
      title: 'Panel',
      layout: 'admin/layout',
      tab,
      filter: statuses.includes(filter) ? filter : '',
      statuses,
      rows,
      counts: { pendingAppointments, newQuotes, newMessages },
      flash: typeof req.query.aviso === 'string' ? req.query.aviso : null,
      noindex: true,
    });
  });

  const back = (tab: Tab, notice?: string) =>
    `/admin?tab=${tab}${notice ? `&aviso=${encodeURIComponent(notice)}` : ''}`;

  router.post('/citas/:id/estado', async (req, res) => {
    const id = idParam.safeParse(req.params.id);
    const status = z
      .enum(appointmentStatuses)
      .safeParse((req.body as Record<string, unknown>).status);
    if (!id.success || !status.success)
      return res.redirect(303, back('citas', 'Estado no válido.'));
    try {
      const ok = await repos.appointments.updateStatus(id.data, status.data, currentUserId(req));
      res.redirect(303, back('citas', ok ? 'Cita actualizada.' : 'La cita no existe.'));
    } catch (error) {
      if (!(error instanceof SlotTakenError)) throw error;
      res.redirect(303, back('citas', 'No se puede reactivar: el turno ya está ocupado.'));
    }
  });

  router.post('/cotizaciones/:id/estado', async (req, res) => {
    const id = idParam.safeParse(req.params.id);
    const status = z.enum(quoteStatuses).safeParse((req.body as Record<string, unknown>).status);
    if (!id.success || !status.success)
      return res.redirect(303, back('cotizaciones', 'Estado no válido.'));
    const ok = await repos.quotes.updateStatus(id.data, status.data, currentUserId(req));
    res.redirect(
      303,
      back('cotizaciones', ok ? 'Cotización actualizada.' : 'La cotización no existe.'),
    );
  });

  router.post('/mensajes/:id/estado', async (req, res) => {
    const id = idParam.safeParse(req.params.id);
    const status = z.enum(messageStatuses).safeParse((req.body as Record<string, unknown>).status);
    if (!id.success || !status.success)
      return res.redirect(303, back('mensajes', 'Estado no válido.'));
    const ok = await repos.messages.updateStatus(id.data, status.data, currentUserId(req));
    res.redirect(303, back('mensajes', ok ? 'Mensaje actualizado.' : 'El mensaje no existe.'));
  });

  return router;
}
