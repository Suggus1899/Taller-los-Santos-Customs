import { Router } from 'express';
import { isUniqueViolation } from '../../../db/client.js';
import { LastAdminError, userRoles } from '../../../repositories/users.js';
import { hashPassword } from '../../../services/password.js';
import { newUserSchema, passwordSchema, userUpdateSchema } from '../../admin-forms.js';
import type { AppContext } from '../../context.js';
import { currentUser } from '../../middleware/auth.js';
import { renderPage } from '../../render.js';
import { toFieldErrors, type FieldErrors } from '../../validation.js';
import { idParam, noticeFrom, withNotice } from './shared.js';

/** Gestión de usuarios del panel (solo ADMIN). */
export function usersRouter(ctx: AppContext): Router {
  const router = Router();
  const { repos } = ctx;

  const renderList = async (
    res: Parameters<typeof renderPage>[0],
    extra: { flash?: string | null; values?: Record<string, unknown>; errors?: FieldErrors } = {},
  ) =>
    renderPage(
      res,
      'admin/users',
      {
        title: 'Usuarios',
        layout: 'admin/layout',
        section: 'usuarios',
        users: await repos.users.list(),
        roles: userRoles,
        flash: extra.flash ?? null,
        values: extra.values ?? { role: 'STAFF' },
        errors: extra.errors ?? {},
        noindex: true,
      },
      extra.errors && Object.keys(extra.errors).length ? 422 : 200,
    );

  router.get('/', (req, res) => renderList(res, { flash: noticeFrom(req.query) }));

  router.post('/', async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const parsed = newUserSchema.safeParse(body);
    const values = { username: body.username, displayName: body.displayName, role: body.role };
    if (!parsed.success) return renderList(res, { values, errors: toFieldErrors(parsed.error) });

    try {
      const { id } = await repos.users.create({
        ...parsed.data,
        passwordHash: await hashPassword(parsed.data.password),
      });
      await repos.audit.write({
        action: 'CREATED',
        entityType: 'USER',
        entityId: id,
        userId: currentUser(req).id,
        metadata: { username: parsed.data.username, role: parsed.data.role },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      return renderList(res, { values, errors: { username: 'Ese usuario ya existe.' } });
    }
    res.redirect(303, withNotice('/admin/usuarios', `Usuario "${parsed.data.username}" creado.`));
  });

  router.post('/:id', async (req, res) => {
    const id = idParam.safeParse(req.params.id);
    const parsed = userUpdateSchema.safeParse(req.body);
    if (!id.success || !parsed.success)
      return res.redirect(303, withNotice('/admin/usuarios', 'Datos no válidos.'));
    try {
      const ok = await repos.users.update(id.data, parsed.data);
      if (ok) {
        await repos.audit.write({
          action: 'UPDATED',
          entityType: 'USER',
          entityId: id.data,
          userId: currentUser(req).id,
          metadata: parsed.data,
        });
      }
      res.redirect(
        303,
        withNotice('/admin/usuarios', ok ? 'Usuario actualizado.' : 'El usuario no existe.'),
      );
    } catch (error) {
      if (!(error instanceof LastAdminError)) throw error;
      res.redirect(303, withNotice('/admin/usuarios', error.message));
    }
  });

  router.post('/:id/clave', async (req, res) => {
    const id = idParam.safeParse(req.params.id);
    const password = passwordSchema.safeParse((req.body as Record<string, unknown>).password);
    if (!id.success || !password.success) {
      const message = password.success
        ? 'Datos no válidos.'
        : (password.error.issues[0]?.message ?? 'Contraseña no válida.');
      return res.redirect(303, withNotice('/admin/usuarios', message));
    }
    const ok = await repos.users.setPassword(id.data, await hashPassword(password.data));
    if (ok) {
      await repos.audit.write({
        action: 'PASSWORD_CHANGED',
        entityType: 'USER',
        entityId: id.data,
        userId: currentUser(req).id,
      });
    }
    res.redirect(
      303,
      withNotice('/admin/usuarios', ok ? 'Contraseña restablecida.' : 'El usuario no existe.'),
    );
  });

  return router;
}
