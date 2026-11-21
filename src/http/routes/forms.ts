import { Router, type Request } from 'express';
import { z } from 'zod';
import {
  calculateEstimate,
  quoteExtras,
  quoteServices,
  vehicleTypes,
} from '../../content/quote.js';
import { findService, services } from '../../content/services.js';
import type { VehicleType } from '../../generated/prisma/enums.js';
import { SlotTakenError } from '../../repositories/appointments.js';
import {
  BOOKING_WINDOW_DAYS,
  addDays,
  timeSlots,
  todayInShopTimezone,
  validateBookingDate,
} from '../../services/schedule.js';
import { notifyInBackground, type AppContext } from '../context.js';
import { formLimiter } from '../middleware/rate-limit.js';
import { renderPage } from '../render.js';
import {
  appointmentSchema,
  contactSchema,
  formValues,
  quoteSchema,
  toFieldErrors,
  type FieldErrors,
} from '../validation.js';

const publicIdSchema = z.uuid();

/** Un bot rellenó el campo trampa: fingimos éxito sin guardar nada. */
function isBot(req: Request): boolean {
  const value: unknown = (req.body as Record<string, unknown> | undefined)?.website;
  return typeof value === 'string' && value.length > 0;
}

export function formsRouter(ctx: AppContext): Router {
  const router = Router();
  const limit = formLimiter(() => !ctx.rateLimit);

  // ─────────────────────────────── Contacto ───────────────────────────────

  const renderContact = (
    res: Parameters<typeof renderPage>[0],
    values = {},
    errors: FieldErrors = {},
  ) =>
    renderPage(
      res,
      'pages/contact',
      {
        title: 'Contacto',
        description: 'Escríbenos, llámanos o visítanos en Cagua, Aragua.',
        values,
        errors,
      },
      Object.keys(errors).length ? 422 : 200,
    );

  router.get('/contacto', async (_req, res) => renderContact(res));

  router.post('/contacto', limit, async (req, res) => {
    if (isBot(req)) return res.redirect(303, '/contacto/enviado');
    const parsed = contactSchema.safeParse(req.body);
    if (!parsed.success)
      return renderContact(res, formValues(req.body), toFieldErrors(parsed.error));

    const { name, email, phone, message } = parsed.data;
    await ctx.repos.messages.create({ customer: { name, email, phone }, message });
    notifyInBackground(
      ctx,
      `Nuevo mensaje de ${name}`,
      `Nombre: ${name}\nCorreo: ${email}\nTeléfono: ${phone ?? '-'}\n\n${message}`,
      email,
    );
    res.redirect(303, '/contacto/enviado');
  });

  router.get('/contacto/enviado', async (_req, res) => {
    await renderPage(res, 'pages/success', {
      title: 'Mensaje enviado',
      heading: '¡Gracias por escribirnos!',
      message: 'Recibimos tu mensaje y te responderemos en horario laboral.',
      noindex: true,
    });
  });

  // ───────────────────────────────── Citas ─────────────────────────────────

  const renderAppointment = (
    res: Parameters<typeof renderPage>[0],
    values: Record<string, unknown> = {},
    errors: FieldErrors = {},
  ) => {
    const today = todayInShopTimezone();
    return renderPage(
      res,
      'pages/appointment',
      {
        title: 'Agendar cita',
        description: 'Reserva tu cita en línea en Taller Los Santos.',
        values,
        errors,
        services,
        timeSlots,
        minDate: addDays(today, 1),
        maxDate: addDays(today, BOOKING_WINDOW_DAYS),
        noindex: false,
      },
      Object.keys(errors).length ? 422 : 200,
    );
  };

  router.get('/cita', async (req, res) => {
    const preselected = typeof req.query.servicio === 'string' ? req.query.servicio : '';
    await renderAppointment(res, findService(preselected) ? { service: preselected } : {});
  });

  /** Turnos ocupados de un día, para que el navegador deshabilite esas horas. */
  router.get('/cita/disponibilidad', async (req, res) => {
    const date = typeof req.query.fecha === 'string' ? req.query.fecha : '';
    const error = validateBookingDate(date);
    if (error) {
      res.status(400).json({ error });
      return;
    }
    res
      .set('Cache-Control', 'no-store')
      .json({ date, taken: await ctx.repos.appointments.takenSlots(date) });
  });

  router.post('/cita', limit, async (req, res) => {
    if (isBot(req)) return res.redirect(303, '/');
    const values = formValues(req.body);
    const parsed = appointmentSchema.safeParse(req.body);
    const errors = parsed.success ? {} : toFieldErrors(parsed.error);
    const dateError = validateBookingDate(values.date ?? '');
    if (dateError) errors.date ??= dateError;
    if (!parsed.success || Object.keys(errors).length)
      return renderAppointment(res, values, errors);

    const { name, email, phone, vehicle, service, date, time, notes } = parsed.data;
    let publicId: string;
    try {
      publicId = await ctx.repos.appointments.create({
        customer: { name, email, phone },
        vehicle,
        serviceSlug: service,
        date,
        timeSlot: time,
        notes,
      });
    } catch (error) {
      if (error instanceof SlotTakenError) {
        return renderAppointment(res, values, {
          time: 'Ese horario acaba de ocuparse. Elige otro.',
        });
      }
      throw error;
    }

    notifyInBackground(
      ctx,
      `Nueva cita: ${date} ${time}`,
      `Cliente: ${name}\nCorreo: ${email}\nTeléfono: ${phone}\nVehículo: ${vehicle ?? '-'}\n` +
        `Servicio: ${findService(service)?.name ?? service}\nFecha: ${date} ${time}\nNotas: ${notes ?? '-'}`,
      email,
    );
    res.redirect(303, `/cita/confirmada/${publicId}`);
  });

  router.get('/cita/confirmada/:publicId', async (req, res, next) => {
    const id = publicIdSchema.safeParse(req.params.publicId);
    const appointment = id.success ? await ctx.repos.appointments.findByPublicId(id.data) : null;
    if (!appointment) return next();
    await renderPage(res, 'pages/appointment-confirmed', {
      title: 'Cita registrada',
      appointment,
      noindex: true,
    });
  });

  // ────────────────────────────── Cotizaciones ─────────────────────────────

  const renderQuote = (
    res: Parameters<typeof renderPage>[0],
    values: Record<string, unknown> = {},
    errors: FieldErrors = {},
  ) =>
    renderPage(
      res,
      'pages/quote',
      {
        title: 'Cotizador en línea',
        description: 'Calcula un precio estimado para tu vehículo en menos de un minuto.',
        values,
        errors,
        vehicleTypes,
        quoteServices,
        quoteExtras,
      },
      Object.keys(errors).length ? 422 : 200,
    );

  router.get('/cotizar', async (_req, res) =>
    renderQuote(res, { vehicleType: 'sedan', extra: 'none' }),
  );

  router.post('/cotizar', limit, async (req, res) => {
    if (isBot(req)) return res.redirect(303, '/');
    const parsed = quoteSchema.safeParse(req.body);
    if (!parsed.success) return renderQuote(res, formValues(req.body), toFieldErrors(parsed.error));

    const { name, email, phone, vehicleType, service, extra, notes } = parsed.data;
    // El precio se calcula aquí, nunca se acepta del navegador.
    const estimate = calculateEstimate({ vehicleType, service, extra });
    const publicId = await ctx.repos.quotes.create({
      customer: { name, email, phone },
      vehicleType: vehicleType.toUpperCase() as VehicleType,
      serviceCode: service,
      extraCode: extra,
      estimateCents: estimate * 100,
      notes,
    });
    notifyInBackground(
      ctx,
      `Nueva cotización: $${estimate}`,
      `Cliente: ${name}\nCorreo: ${email}\nTeléfono: ${phone ?? '-'}\n` +
        `Vehículo: ${vehicleType}\nServicio: ${service}\nExtra: ${extra}\nEstimado: $${estimate}\nNotas: ${notes ?? '-'}`,
      email,
    );
    res.redirect(303, `/cotizar/resultado/${publicId}`);
  });

  router.get('/cotizar/resultado/:publicId', async (req, res, next) => {
    const id = publicIdSchema.safeParse(req.params.publicId);
    const quote = id.success ? await ctx.repos.quotes.findByPublicId(id.data) : null;
    if (!quote) return next();
    await renderPage(res, 'pages/quote-result', { title: 'Tu cotización', quote, noindex: true });
  });

  return router;
}
