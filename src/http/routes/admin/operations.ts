import { Router } from 'express';
import { z } from 'zod';
import { appointmentStatuses, SlotTakenError } from '../../../repositories/appointments.js';
import { messageStatuses } from '../../../repositories/messages.js';
import { quoteStatuses } from '../../../repositories/quotes.js';
import type { AppContext } from '../../context.js';
import { currentUser } from '../../middleware/auth.js';
import { renderPage } from '../../render.js';
import { idParam, noticeFrom, withNotice } from './shared.js';

const tabs = ['citas', 'cotizaciones', 'mensajes'] as const;
type Tab = (typeof tabs)[number];

/** Operaciones diarias: citas, cotizaciones y mensajes (STAFF y ADMIN). */
export function operationsRouter(ctx: AppContext): Router {
  const router = Router();
  const { repos, useCases } = ctx;

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
      section: 'operaciones',
      tab,
      filter: statuses.includes(filter) ? filter : '',
      statuses,
      rows,
      counts: { pendingAppointments, newQuotes, newMessages },
      flash: noticeFrom(req.query),
      noindex: true,
    });
  });

  const back = (tab: Tab, notice: string) => withNotice(`/admin?tab=${tab}`, notice);

  router.post('/citas/:id/estado', async (req, res) => {
    const id = idParam.safeParse(req.params.id);
    const status = z
      .enum(appointmentStatuses)
      .safeParse((req.body as Record<string, unknown>).status);
    if (!id.success || !status.success)
      return res.redirect(303, back('citas', 'Estado no válido.'));
    try {
      const ok = await useCases.changeAppointmentStatus(id.data, status.data, currentUser(req).id);
      res.redirect(303, back('citas', ok ? 'Cita actualizada.' : 'La cita no existe.'));
    } catch (error) {
      if (!(error instanceof SlotTakenError)) throw error;
      res.redirect(303, back('citas', 'No se puede reactivar: el turno ya está ocupado.'));
    }
  });

  router.post('/cotizaciones/:id/estado', async (req, res) => {
    const id = idParam.safeParse(req.params.id);
    const status = z.enum(quoteStatuses).safeParse((req.body as Record<string, unknown>).status);
    if (!id.success || !status.success) {
      return res.redirect(303, back('cotizaciones', 'Estado no válido.'));
    }
    const ok = await repos.quotes.updateStatus(id.data, status.data, currentUser(req).id);
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
    const ok = await repos.messages.updateStatus(id.data, status.data, currentUser(req).id);
    res.redirect(303, back('mensajes', ok ? 'Mensaje actualizado.' : 'El mensaje no existe.'));
  });

  return router;
}
