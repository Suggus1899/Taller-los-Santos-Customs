import { Router } from 'express';
import { z } from 'zod';
import { hashPassword, verifyPassword } from '../../../services/password.js';
import { passwordSchema } from '../../admin-forms.js';
import type { AppContext } from '../../context.js';
import { currentUser } from '../../middleware/auth.js';
import { renderPage } from '../../render.js';
import { toFieldErrors, type FieldErrors } from '../../validation.js';

const changePasswordSchema = z
  .object({
    current: z.string().min(1, 'Escribe tu contraseña actual.'),
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: 'Las contraseñas no coinciden.',
    path: ['confirm'],
  });

/** Cuenta propia: cualquier usuario puede cambiar su contraseña. */
export function accountRouter(ctx: AppContext): Router {
  const router = Router();
  const { repos } = ctx;

  const render = (
    res: Parameters<typeof renderPage>[0],
    extra: { errors?: FieldErrors; done?: boolean } = {},
  ) =>
    renderPage(
      res,
      'admin/account',
      {
        title: 'Mi cuenta',
        layout: 'admin/layout',
        section: 'cuenta',
        errors: extra.errors ?? {},
        done: extra.done ?? false,
        values: {},
        noindex: true,
      },
      extra.errors && Object.keys(extra.errors).length ? 422 : 200,
    );

  router.get('/cuenta', (req, res) => render(res, { done: req.query.ok === '1' }));

  router.post('/cuenta', async (req, res) => {
    const me = currentUser(req);
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) return render(res, { errors: toFieldErrors(parsed.error) });

    const user = await repos.users.findById(me.id);
    if (!user || !(await verifyPassword(parsed.data.current, user.passwordHash))) {
      return render(res, { errors: { current: 'La contraseña actual no es correcta.' } });
    }
    await repos.users.setPassword(me.id, await hashPassword(parsed.data.password));
    await repos.audit.write({
      action: 'PASSWORD_CHANGED',
      entityType: 'USER',
      entityId: me.id,
      userId: me.id,
    });
    res.redirect(303, '/admin/cuenta?ok=1');
  });

  return router;
}
